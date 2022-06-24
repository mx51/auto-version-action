// https://www.conventionalcommits.org/en/v1.0.0/

// <type>[optional scope]: <description>

// [optional body]

// [optional footer(s)]

export function cleanChangelogEntry(changelogMsg: string) {
  let result = changelogMsg
    .split('\n\n')
    .filter(Rules.followsContentionalPattern)
    .filter(Rules.startsWithAsterisk) // starts with *
    .join('\n\n')
}

class Rules {
  // const reConventionalCommitPattern = /(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)+(!|\(\w+\))?:\s?\w.+/g
  static startsWithAsterisk = (str: string) => str.startsWith('*')
  static followsContentionalPattern = (str: string) =>
    /(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)+(!|\(\w+\))?:\s?\w.+/g.test(
      str
    )
}
