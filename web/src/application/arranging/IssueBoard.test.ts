import { describe, expect, it } from 'vitest'
import type { ArrangementLint } from '../../domain/arranging/qa/types'
import { groupIssues, issueBoardSummary } from './IssueBoard'

const lint = (
  severity: ArrangementLint['severity'],
  id: string,
): ArrangementLint => ({
  id,
  ruleId: id,
  severity,
  message: `${severity} ${id}`,
})

describe('IssueBoard', () => {
  it('groups by severity and drops empty sections', () => {
    const groups = groupIssues([
      lint('error', 'e1'),
      lint('warn', 'w1'),
      lint('warn', 'w2'),
      lint('info', 'i1'),
    ])
    expect(groups.map((g) => g.id)).toEqual(['blockers', 'improve', 'info'])
    expect(groups[0]!.items).toHaveLength(1)
    expect(groups[1]!.items).toHaveLength(2)
  })

  it('summarizes counts', () => {
    expect(issueBoardSummary([lint('error', 'a'), lint('info', 'b')])).toEqual({
      blockers: 1,
      improve: 0,
      info: 1,
    })
  })
})
