import * as core from '@actions/core'
import * as github from '@actions/github'
import { join } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { Context } from '@actions/github/lib/context';
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';

enum SemVerType {
  MAJOR,
  MINOR,
  PATCH,
  UNKNOWN
}

enum SupportedEvent {
  PUSH = "push",
  PR = "pull_request",
  PRR = "pull_request_review"
}

enum Inputs {
  GITHUB_TOKEN = 'github_token',
  PROJECT_DIR = 'project_dir',
  CHANGELOG_MSG = 'changelog_msg',
  ADD_CHANGELOG_ENTRY = 'add_changelog_entry',
  BRANCH = 'branch',
  CHANGELOG_FILENAME = 'changelog_filename',
}

const options: Partial<SimpleGitOptions> = {
  baseDir: process.cwd(),
  binary: 'git',
  maxConcurrentProcesses: 1,
};

const reSemVerFormat = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/
const reSemVerFormatBasic = /^[0-9]+.[0-9]+.[0-9]+/
const reSemVerChangeLogEntry = /^\#\#\s\[([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?\]/m
const reMajor = /#major|\[\s?major\s?\]/gi
const reMinor = /#minor|\[\s?minor\s?\]/gi
const rePatch = /#patch|\[\s?patch\s?\]/gi

const git: SimpleGit = simpleGit(options);
git
  .addConfig('user.name', 'github-actions')
  .addConfig('user.email', 'github-actions@github.com')

/**
 * Retrieves the package version from the package.json file
 * 
 * @param projectDir 
 * @returns The current package version and the jsonData object
 */
function getPackageVersion(packageJsonPath: string): any {
  const jsonStr = readFile(packageJsonPath)
  const jsonData = JSON.parse(jsonStr)
  const version = jsonData.version
  return { version, jsonData }
}



/**
 * Retrieves the package version from the package.json file
 * 
 * @param projectDir 
 * @returns The current package version and the jsonData object
 */
function updatePackageVersion(packageJsonPath: string, data: any): any {
  writeToFile(packageJsonPath, JSON.stringify(data, null, 2))
}

function writeToFile(filePath: string, content: string) {
  try {
    writeFileSync(filePath, content)
  } catch (error) {
    throw new Error(`Failed to update file: ${filePath}`)
  }
}

function readFile(filePath: string, encoding: "utf8" | "base64" | "ascii" = "utf8") {
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
  return reSemVerFormat.test(version);
}

function getChangeTypeFromString(str: string): SemVerType {
  if (reMajor.test(str)) return SemVerType.MAJOR
  if (reMinor.test(str)) return SemVerType.MINOR
  if (rePatch.test(str)) return SemVerType.PATCH

  return SemVerType.UNKNOWN
}

function incrementStrNum(num: string) {
  return (parseInt(num) + 1).toString()
}

function incrementSemVer(version: string, semVerType: SemVerType) {
  if (!isSemVer(version)) {
    throw new Error(`Version '${version}' does not follow Semantic Versioning pattern`)
  }
  let numberPart = reSemVerFormatBasic.exec(version)
  let arr = numberPart![0].split(".");

  switch (semVerType) {
    case SemVerType.MAJOR:
      arr[0] = incrementStrNum(arr[0])
      break;
    case SemVerType.MINOR:
      arr[1] = incrementStrNum(arr[1])
      break;
    case SemVerType.PATCH:
      arr[2] = incrementStrNum(arr[2])
      break;
    default:
      throw new Error("ERROR")
  }
  return version.replace(numberPart![0], arr.join("."))
}

async function fetchPRTitle(pr: any, githubToken: string) {
  const owner = pr.base.user.login;
  const repo = pr.base.repo.name;

  const client = github.getOctokit(githubToken);
  // The pull request info on the context isn't up to date. When
  // the user updates the title and re-runs the workflow, it would
  // be outdated. Therefore fetch the pull request via the REST API
  // to ensure we use the current title.
  const response = await client.rest.pulls.get({
    owner,
    repo,
    pull_number: pr.number
  });

  return response.data.title;
}

/**
 * Commit changes to a remote branch
 * 
 * @param branchRef Name of the branch to commit changes to
 * @param msg The commit message
 * @param fileRef [Optional] Reference to file to commit. References all changed files by default
 */
async function commitChanges(branchRef: string, msg: string, fileRef: string = ".") {
  core.debug("Commit & push changes")

  await git
    .add(fileRef)
    .commit(msg)
    .push('origin', `HEAD:${branchRef}`, ["--force"]);
}

function updateChangeLog(filePath: string, version: string, msg: string) {
  const newEntry = `## [${version}] - ${msg}\n`

  let content = readFile(filePath)
  // Find the location to insert
  const latestEntryIndex = content.search(reSemVerChangeLogEntry)
  let newContent = `${content.substring(0, latestEntryIndex)}${newEntry}\n${content.substring(latestEntryIndex)}`;
  writeToFile(filePath, newContent);
}


async function run(): Promise<void> {
  try {
    const githubToken = core.getInput(Inputs.GITHUB_TOKEN);
    const projectDir = core.getInput(Inputs.PROJECT_DIR);
    const changelogMsg = core.getInput(Inputs.CHANGELOG_MSG);
    const addChangeLogEntry = core.getInput(Inputs.ADD_CHANGELOG_ENTRY);
    const branchRef = core.getInput(Inputs.BRANCH);
    const changelogFilename = core.getInput(Inputs.CHANGELOG_FILENAME);

    const packageJsonPath = join(projectDir, 'package.json')
    const changelogPath = join(projectDir, changelogFilename)

    const context: Context = github.context;
    const eventName = context.eventName;
    const supportedEvents = Object.values<string>(SupportedEvent);

    if (!supportedEvents.includes(eventName)) throw new Error(`This Github Action does not support '${eventName}' events`)

    let changeType: SemVerType = SemVerType.UNKNOWN;
    if (eventName == SupportedEvent.PR || eventName == SupportedEvent.PRR) {
      core.debug("Checking title format...")

      const title = await fetchPRTitle(context.payload.pull_request, githubToken)

      changeType = getChangeTypeFromString(title);

      if (changeType == SemVerType.UNKNOWN) throw new Error(`
        PR title, '${title}' does not specify a Semantic Version type.

        Select one of these change types: MAJOR, MINOR or PATCH
        and prefix to title after a '#' or between square brackets '[]'

        e.g. #MAJOR <PR description> or [MINOR] <PR description>
      `);
    }

    const { version, jsonData } = getPackageVersion(packageJsonPath)

    if (eventName == SupportedEvent.PUSH) {
      if(addChangeLogEntry && (!changelogFilename || !changelogMsg)) 
        throw new Error(`To add a Changelog entry, '${Inputs.CHANGELOG_MSG}' must be specified`)
      
      if (addChangeLogEntry) {
        updateChangeLog(changelogPath, version, changelogMsg)
        commitChanges(branchRef, `Updating ${changelogFilename}`, changelogPath)
      } else {
        core.warning(`No action taken. Set ${Inputs.ADD_CHANGELOG_ENTRY} to add a changelog entry`)
      }
    }

    // The rest of the functionality should only be done on PR approval
    // so we can return in all other cases.
    if(eventName !== SupportedEvent.PRR) return;
    // const branchRef = context.payload.pull_request!.head.ref
    // core.setOutput('branch_ref', branchRef)
    
    core.debug("Checking version follows SemVer format...")
    if (!isSemVer(version)) {
      throw new Error(`Current version '${version}' does not follow Semantic Versioning pattern`)
    }

    let newVersion = incrementSemVer(version, changeType)
    
    core.setOutput('current_version', version)
    core.setOutput('new_version', newVersion)

    jsonData.version = newVersion;

    core.info(`Updating version ${version} to ${newVersion}`);

    updatePackageVersion(packageJsonPath, jsonData)
    commitChanges(branchRef, "Updating package.json", packageJsonPath)

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
