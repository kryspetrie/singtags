/**
 * CI floor for Auto Coach honest micros (no gold pillars).
 * Runs the Node harness once; fails if micro regresses below checked-in floors.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import floor from './honestAutoFloor.json'

const SITE = resolve(import.meta.dirname, '../../../../../')
const LATEST = resolve(SITE, 'work/polecat-honest-loop/latest.json')
const SCRIPT = resolve(SITE, 'scripts/arranging/polecatHonestScore.mjs')

describe('honest Auto floor', () => {
  it(
    'pmnRootHit / timeHit stay above checked-in floors',
    () => {
      execFileSync(process.execPath, [SCRIPT, '--label', 'ci-floor'], {
        cwd: SITE,
        stdio: 'pipe',
        timeout: 180_000,
      })
      expect(existsSync(LATEST)).toBe(true)
      const latest = JSON.parse(readFileSync(LATEST, 'utf8')) as {
        micro: { pmnRootHit: number; timeHit: number }
      }
      const eps = floor.eps ?? 0.03
      expect(
        latest.micro.pmnRootHit,
        `pmnRootHit ${latest.micro.pmnRootHit} < floor ${floor.micro.pmnRootHit - eps}`,
      ).toBeGreaterThanOrEqual(floor.micro.pmnRootHit - eps)
      expect(
        latest.micro.timeHit,
        `timeHit ${latest.micro.timeHit} < floor ${floor.micro.timeHit - eps}`,
      ).toBeGreaterThanOrEqual(floor.micro.timeHit - eps)
    },
    200_000,
  )
})
