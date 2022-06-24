import * as core from '@actions/core'
import * as github from '@actions/github'
import {join} from 'path'
import {writeFileSync, readFileSync} from 'fs'
import {Context} from '@actions/github/lib/context'
import {GitHub} from '@actions/github/lib/utils'
import simpleGit, {SimpleGit, SimpleGitOptions, Options} from 'simple-git'
import {WebhookPayload} from '@actions/github/lib/interfaces'

enum SemVerType {
  MAJOR,
  MINOR,
  PATCH,
  UNKNOWN
}

enum SupportedEvent {
  PUSH = 'push',
  PR = 'pull_request',
  PRR = 'pull_request_review'
}

enum Inputs {
  GITHUB_TOKEN = 'github_token',
  PROJECT_DIR = 'project_dir',
  CHANGELOG_MSG = 'changelog_msg',
  ADD_CHANGELOG_ENTRY = 'add_changelog_entry',
  BRANCH = 'branch',
  CHANGELOG_FILENAME = 'changelog_filename',
  MAJOR_LABEL = 'major_label',
  MINOR_LABEL = 'minor_label',
  PATCH_LABEL = 'patch_label',
  ADD_INSTRUCTIONS = 'add_instructions'
}

const options: Partial<SimpleGitOptions> = {
  baseDir: process.cwd(),
  binary: 'git',
  maxConcurrentProcesses: 1
}

const reSemVerFormat =
  /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/
const reSemVerFormatBasic = /^[0-9]+.[0-9]+.[0-9]+/
const reSemVerChangeLogEntry =
  /^\#\#\s\[([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?\]/m
const reMajor = /#major|\[\s?major\s?\]/gi
const reMinor = /#minor|\[\s?minor\s?\]/gi
const rePatch = /#patch|\[\s?patch\s?\]/gi

const git: SimpleGit = simpleGit(options)
// git.addConfig('user.name', 'github-actions')
//   .addConfig('user.email', 'github-actions@github.com')

let pr: any
let majorLabel: string
let minorLabel: string
let patchLabel: string
/**
 * Retrieves the package version from the package.json file
 *
 * @param projectDir
 * @returns The current package version and the jsonData object
 */
function getPackageVersion(packageJsonPath: string): any {
  core.debug('Getting version from package.json...')

  const jsonStr = readFile(packageJsonPath)
  const jsonData = JSON.parse(jsonStr)
  const version = jsonData.version

  core.debug('Checking version follows SemVer format...')
  if (!isSemVer(version))
    throw new Error(
      `Version '${version}' does not follow Semantic Versioning pattern`
    )

  return {version, jsonData}
}

/**
 * Retrieves the package version from the package.json file
 *
 * @param projectDir
 * @returns The current package version and the jsonData object
 */
function updatePackageVersion(packageJsonPath: string, data: Object): void {
  writeToFile(packageJsonPath, JSON.stringify(data, null, 2))
}

function writeToFile(filePath: string, content: string): void {
  try {
    writeFileSync(filePath, content)
  } catch (error) {
    throw new Error(`Failed to update file: ${filePath}`)
  }
}

function readFile(
  filePath: string,
  encoding: 'utf8' | 'base64' | 'ascii' = 'utf8'
): string {
  try {
    return readFileSync(filePath, encoding)
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}`)
  }
}

/**
 * Check the version description follows Semantic Versioning format
 *
 * @param version A version description to be checked
 * @returns
 */
function isSemVer(version: string): boolean {
  return reSemVerFormat.test(version)
}

function getChangeTypeFromString(str: string): SemVerType {
  if (reMajor.test(str)) return SemVerType.MAJOR
  if (reMinor.test(str)) return SemVerType.MINOR
  if (rePatch.test(str)) return SemVerType.PATCH

  throw new Error(`
    '${str}' does not specify a Semantic Version type.

    Select one of these change types: MAJOR, MINOR or PATCH
    and prefix to string between square brackets '[]'

    e.g. [MINOR] <string>
  `)
}

function getChangeTypeFromLabels(labelsArr: any[]): SemVerType {
  const labels = labelsArr.map((label: any) => label.name || '')
  if (labels.includes(majorLabel)) return SemVerType.MAJOR
  if (labels.includes(minorLabel)) return SemVerType.MINOR
  if (labels.includes(patchLabel)) return SemVerType.PATCH

  return SemVerType.UNKNOWN
}

function incrementStrNum(num: string) {
  return (parseInt(num) + 1).toString()
}

/**
 * Increment the Semantic Version depending on the change type
 * @param version A package version which follows the SemVer pattern
 * @param semVerType The SemVer change type (MAJOR, MINOR or PATCH)
 * @returns The newly incremented version
 */
function incrementSemVer(version: string, semVerType: SemVerType) {
  if (!isSemVer(version)) {
    throw new Error(
      `Version '${version}' does not follow Semantic Versioning pattern`
    )
  }
  let numberPart = reSemVerFormatBasic.exec(version)
  let arr = numberPart![0].split('.')

  switch (semVerType) {
    case SemVerType.MAJOR:
      arr[0] = incrementStrNum(arr[0])
      arr[1] = '0'
      arr[2] = '0'
      break
    case SemVerType.MINOR:
      arr[1] = incrementStrNum(arr[1])
      arr[2] = '0'
      break
    case SemVerType.PATCH:
      arr[2] = incrementStrNum(arr[2])
      break
    default:
      throw new Error('ERROR')
  }
  return version.replace(numberPart![0], arr.join('.'))
}

/**
 * Fetch the PR title via the GitHub Rest API
 *
 * @param pr The pull_request object
 * @param githubToken The GitHub Token
 * @returns The PR title
 */
async function fetchPRTitle(
  pr: WebhookPayload['pull_request'],
  githubToken: string
) {
  if (!pr) throw new Error('pull_request object is undefined')

  const owner = pr.base.user.login
  const repo = pr.base.repo.name

  const client = github.getOctokit(githubToken)

  const response = await client.rest.pulls.get({
    owner,
    repo,
    pull_number: pr.number
  })

  return response.data.title
}

/**
 * Commit changes to a remote branch
 *
 * @param branchRef Name of the branch to commit changes to
 * @param msg The commit message
 * @param fileRef [Optional] Reference to file to commit. References all changed files by default
 */
async function commitChanges(
  branchRef: string,
  msg: string,
  fileRef: string | undefined = '.',
  options: any | undefined = undefined
) {
  core.debug('Commit & push changes')

  await git
    .addConfig('user.name', 'github-actions')
    .addConfig('user.email', 'github-actions@github.com')
    .add(fileRef)
    .commit(msg, options)
    .push('origin', `HEAD:${branchRef}`, ['--force'])
}

function updateChangeLog(filePath: string, version: string, msg: string) {
  const newEntry = `## [${version}] - ${getCurrentDate()}\n\n${msg}\n`

  let content = readFile(filePath)
  // Find the location to insert
  const latestEntryIndex = content.search(reSemVerChangeLogEntry)
  let newContent =
    latestEntryIndex >= 0
      ? `${content.substring(
          0,
          latestEntryIndex
        )}${newEntry}\n${content.substring(latestEntryIndex)}`
      : `${content}\n${newEntry}`

  writeToFile(filePath, newContent)
}

function getCurrentDate() {
  const dt = new Date()
  const year = dt.getFullYear()
  const month = (dt.getMonth() + 1).toString().padStart(2, '0')
  const day = dt.getDate().toString().padStart(2, '0')
  return `${day}-${month}-${year}`
}

async function getPullRequestLabelNames(
  octokit: InstanceType<typeof GitHub>
): Promise<string[]> {
  const owner = github.context.repo.owner
  const repo = github.context.repo.repo
  const commit_sha = github.context.sha

  const response =
    await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha
    })

  const pr = response.data.length > 0 && response.data[0]
  return pr ? pr.labels.map((label: any) => label.name || '') : []
}

async function getPRFromContext(
  octokit: InstanceType<typeof GitHub>,
  context: Context
) {
  const owner = context.repo.owner
  const repo = context.repo.repo
  const commit_sha = context.sha
  const response =
    await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha
    })
  return response.data.length > 0 && response.data[0]
}

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput(Inputs.GITHUB_TOKEN)
    const projectDir = core.getInput(Inputs.PROJECT_DIR)
    const addChangeLogEntry = core.getInput(Inputs.ADD_CHANGELOG_ENTRY)
    const changelogFilename = core.getInput(Inputs.CHANGELOG_FILENAME)
    const addInstructions = core.getInput(Inputs.ADD_INSTRUCTIONS)

    let changelogMsg = core.getInput(Inputs.CHANGELOG_MSG)
    let branchRef = core.getInput(Inputs.BRANCH)

    majorLabel = core.getInput(Inputs.MAJOR_LABEL)
    minorLabel = core.getInput(Inputs.MINOR_LABEL)
    patchLabel = core.getInput(Inputs.PATCH_LABEL)

    const packageJsonPath = join(projectDir, 'package.json')
    const changelogPath = join(projectDir, changelogFilename)

    const context: Context = github.context
    const gitHubClient = github.getOctokit(githubToken)

    console.log(context)

    const eventName = context.eventName
    const supportedEvents = Object.values<string>(SupportedEvent)

    if (!supportedEvents.includes(eventName))
      throw new Error(
        `This Github Action does not support '${eventName}' events`
      )

    let changeType: SemVerType = SemVerType.UNKNOWN
    if (eventName == SupportedEvent.PR || eventName == SupportedEvent.PRR) {
      core.debug('Checking PR labels...')

      changeType = getChangeTypeFromLabels(context.payload.pull_request!.labels)
      if (changeType === SemVerType.UNKNOWN)
        throw new Error(`
        No expected labels found.
    
        Please add labels '${majorLabel}', '${minorLabel}' or '${patchLabel}' to PR.
      `)
    }

    if (eventName == SupportedEvent.PRR && addInstructions) {
      core.debug('Adding instructions as empty commit...')
      branchRef = context.payload.pull_request!.head.ref

      commitChanges(branchRef, '<!-- This is an instruction -->', undefined, {
        '--allow-empty': null
      })
    }

    if (eventName == SupportedEvent.PUSH) {
      pr = await getPRFromContext(gitHubClient, context)

      if (!pr) return

      changeType = getChangeTypeFromLabels(pr.labels)
      if (changeType === SemVerType.UNKNOWN)
        throw new Error(
          `PR labels '${majorLabel}', '${minorLabel}' or '${patchLabel}' no found.`
        )

      const {version, jsonData} = getPackageVersion(packageJsonPath)

      let newVersion = incrementSemVer(version, changeType)

      core.info(`Updating version ${version} to ${newVersion}`)
      jsonData.version = newVersion
      updatePackageVersion(packageJsonPath, jsonData)

      if (addChangeLogEntry && (!changelogFilename || !changelogMsg))
        throw new Error(
          `To add a Changelog entry, '${Inputs.CHANGELOG_FILENAME}' & '${Inputs.CHANGELOG_MSG}' must be specified`
        )

      commitChanges(branchRef, 'Updating package.json', packageJsonPath)

      if (addChangeLogEntry) {
        // Remove PR title by removing any line that doesn't start with an '*'
        changelogMsg = changelogMsg
          .split('\n\n')
          .filter(line => line[0] === '*')
          .join('\n\n')

        updateChangeLog(changelogPath, newVersion, changelogMsg)
        commitChanges(branchRef, `Updating ${changelogFilename}`, changelogPath)
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
