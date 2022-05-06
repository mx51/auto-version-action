import * as core from '@actions/core'
import * as github from '@actions/github'
import {wait} from './wait'
import { join } from 'path';
import { readdirSync, readFileSync} from 'fs';

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

function listFilesInDir(path: string){
  console.log("Listing files in directory: ",path)
  const files = readdirSync(path)
  for (const file of files) {
    console.log(file)
  }
}

async function run(): Promise<void> {
  try {
    const projectDir = core.getInput('projectDir')

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
