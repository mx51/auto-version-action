import * as core from '@actions/core'
import * as github from '@actions/github'
import { wait } from './wait'
import { join } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { Context } from '@actions/github/lib/context';

const MAJOR_RE = /#major|\[\s?major\s?\]/gi
const MINOR_RE = /#minor|\[\s?minor\s?\]/gi
const PATCH_RE = /#patch|\[\s?patch\s?\]/gi

enum SemVerType {
  MAJOR,
  MINOR,
  PATCH,
  UNKNOWN
}

enum SupportedEvent {
  PR = "pull_request",
  PRR = "pull_request_review"
}

/**
 * Retrieves the package version from the package.json file
 * 
 * @param projectDir 
 * @returns The current package version and the jsonData object
 */
function getPackageVersion(projectDir: string): any {
  const packageJsonPath = join(projectDir, 'package.json')
  try {
    const jsonData = readFileSync(packageJsonPath, 'utf8')
    const version = JSON.parse(jsonData).version
    return { version, jsonData }
  } catch (error) {
    throw new Error(`Failed to read file: ${packageJsonPath}`)
  }
}

/**
 * Retrieves the package version from the package.json file
 * 
 * @param projectDir 
 * @returns The current package version and the jsonData object
 */
 function updatePackageVersion(projectDir: string, data: any): any {
  const packageJsonPath = join(projectDir, 'package.json')
  try {
    writeFileSync(packageJsonPath, JSON.stringify(data, null, 2))
  } catch (error) {
    throw new Error(`Failed to update file: ${packageJsonPath}`)
  }
}

/**
 * Check the version description follows Semantic Versioning format
 * 
 * @param version A version description to be checked
 * @returns 
 */
function isSemVer(version: string): boolean {
  return /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/.test(version);
}

// async function getChangeTypeForContext(context: Context) {
//   const titleTag = getChangeTypeForString(context.payload.pull_request?.body);
//   if (titleTag !== ChangeTypes.UNKNOWN) {
//     return titleTag;
//   }
//   const bodyTag = getChangeTypeForString(context.payload.pull_request.body);
//   if (bodyTag !== ChangeTypes.UNKNOWN) {
//     return bodyTag;
//   }

//   return ChangeTypes.UNKNOWN;
// }

function getChangeTypeFromString(str: string): SemVerType {
  if (typeof str !== "string") {
    core.warning(`called getChangeTypeForString with non string: ${str}`)
    return SemVerType.UNKNOWN
  }

  if (MAJOR_RE.test(str)) return SemVerType.MAJOR
  if (MINOR_RE.test(str)) return SemVerType.MINOR
  if (PATCH_RE.test(str)) return SemVerType.PATCH

  return SemVerType.UNKNOWN
}

// function listFilesInDir(path: string) {
//   console.log("Listing files in directory: ", path)
//   const files = readdirSync(path)
//   for (const file of files) {
//     console.log(file)
//   }
// }

function incrementStrNum(num: string){
  return (parseInt(num)+1).toString()
}

function incrementSemVer(version: string, semVerType: SemVerType){
  if (!isSemVer(version)) {
    throw new Error(`Version '${version}' does not follow Semantic Versioning pattern`)
  }
    let numberPart = /^[0-9]+.[0-9]+.[0-9]+/.exec(version)
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
    return version.replace(numberPart![0],arr.join("."))
}

async function fetchPRTitle(pr: any, githubToken: string){
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

async function run(): Promise<void> {
  try {

    const githubToken = core.getInput('github_token');
    const projectDir = core.getInput('project_dir');

    const context: Context = github.context;
    const eventName = context.eventName;
    const supportedEvents = Object.values<string>(SupportedEvent);

    if (!supportedEvents.includes(eventName)) throw new Error(`This Github Action does not support '${eventName}' events`)

    console.log("EVENT NAME", eventName)

    let changeType: SemVerType = SemVerType.UNKNOWN;
    if (eventName == SupportedEvent.PR || eventName == SupportedEvent.PRR) {
      const title = await fetchPRTitle(context.payload.pull_request,githubToken)
      
      changeType = getChangeTypeFromString(title);

      console.log({title})

      if (changeType == SemVerType.UNKNOWN) throw new Error(`
        PR title, '${title}' does not specify a Semantic Version type.

        Select one of these change types: MAJOR, MINOR or PATCH
        and prefix to title after a '#' or between square brackets '[]'

        e.g. #MAJOR <PR description> or [MINOR] <PR description>
      `);
    }

    console.log(context)
    // The rest of the functionality should only be done on PR approval
    // so we can return in all other cases.
    if(eventName !== SupportedEvent.PRR) return;

    // console.log(client)

    const { version, jsonData } = getPackageVersion(projectDir)

    if (!isSemVer(version)) {
      throw new Error(`Current version '${version}' does not follow Semantic Versioning pattern`)
    }
    
    core.setOutput('current_version', version)
    
    let newVersion = incrementSemVer(version, changeType)
    
    core.setOutput('new_version', newVersion)

    jsonData.version = newVersion;

    console.log(`Updating version ${version} to ${newVersion}`);

    updatePackageVersion(projectDir, jsonData)


    // const ms: string = core.getInput('milliseconds')
    // core.debug(`Waiting ${ms} milliseconds ...`) // debug is only output if you set the secret `ACTIONS_STEP_DEBUG` to true

    // core.debug(new Date().toTimeString())
    // await wait(parseInt(ms, 10))
    // core.debug(new Date().toTimeString())

    // core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
