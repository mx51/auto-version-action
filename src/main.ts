import * as core from '@actions/core'
import * as github from '@actions/github'
import {wait} from './wait'
import { join } from 'path';
import { readdirSync, readFileSync} from 'fs';
import { Context } from '@actions/github/lib/context';

const MAJOR_RE = /#major|\[\s?major\s?\]/gi
const MINOR_RE = /#minor|\[\s?minor\s?\]/gi
const PATCH_RE = /#patch|\[\s?patch\s?\]/gi

enum ChangeTypes {
  MAJOR,
  MINOR,
  PATCH,
  UNKNOWN
}
/**
 * Retrieves the package version from the package.json file
 * 
 * @param projectDir 
 * @returns The current package version
 */
function getPackageVersion(projectDir: string): string {
  const packageJsonPath = join(projectDir,'package.json')
  try {
    let jsonData = readFileSync(packageJsonPath, 'utf8')
    return JSON.parse(jsonData).version
  } catch (error) {
    throw new Error(`Failed to read file: ${packageJsonPath}`)
  }
}

/**
 * Check the version description follows Semantic Versioning format
 * 
 * @param version A version description to be checked
 * @returns 
 */
function isSemVer(version: string): boolean {
  return /^[0-9]+.[0-9]+.[0-9]+/.test(version);
}

function detectChangeType(){

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

function getChangeTypeForString(str: string): ChangeTypes {
  if (typeof str !== "string") {
    core.warning(`called getChangeTypeForString with non string: ${str}`)
    return ChangeTypes.UNKNOWN
  }
  
  if(MAJOR_RE.test(str)) return ChangeTypes.MAJOR
  if(MINOR_RE.test(str)) return ChangeTypes.MINOR
  if(PATCH_RE.test(str)) return ChangeTypes.PATCH
  
  return ChangeTypes.UNKNOWN
}

function listFilesInDir(path: string){
  console.log("Listing files in directory: ",path)
  const files = readdirSync(path)
  for (const file of files) {
    console.log(file)
  }
}

async function run(): Promise<void> {
  try {
    
    const githubToken = core.getInput('github_token');
    const projectDir = core.getInput('project_dir');

    const client = github.getOctokit(githubToken);
    const context: Context = github.context;


    console.log(client)
    console.log(context)

    const version = getPackageVersion(projectDir)

    if(!isSemVer(version)) {
      throw new Error(`Current version '${version}' does not follow Semantic Versioning pattern`)
    }

    core.setOutput('current_version', version)
    
    
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
