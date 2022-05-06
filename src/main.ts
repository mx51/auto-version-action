import * as core from '@actions/core'
import * as github from '@actions/github'
import {wait} from './wait'
import { join } from 'path';
import { readdirSync, readFile, readFileSync} from 'fs';
// const { promises: fs } = require('fs')

/**
 * Retrieves the package version from the package.json file
 */
function getVersion(projectDir: string){
  try {
    listFilesInDir(projectDir);
    const packageJsonPath = join(projectDir,'package.json')
    let jsonData = readFileSync(packageJsonPath, 'utf8')
    const version = JSON.parse(jsonData).version
    // console.log({packageJsonPath})
    // const jsonData: any = require('./package.json')
    console.log({version})
    // console.log(jsonData.version)
    
  } catch (error) {
    throw new Error("File does not exist")
  }

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
    console.log("HELLo WORLD")
    console.log("Current directory:", __dirname);
    listFilesInDir(__dirname);

    getVersion(projectDir)
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
