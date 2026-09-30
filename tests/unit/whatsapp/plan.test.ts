import { describe, expect, it } from 'vitest'
import { applyCap, collapseCatchUp, type Candidate } from '@/lib/whatsapp/plan'

const row = (
  id: string,
  dueInstanceId: string,
  daysBefore: number,
  recipientType: Candidate['recipientType'] = 'client',
): Candidate => ({ id, dueInstanceId, daysBefore, recipientType })

describe('collapseCatchUp', () => {
  it('keeps only the latest window per due date and recipient', () => {
    const { keep, superseded } = collapseCatchUp([row('a30', 'i1', 30), row('a15', 'i1', 15)])
    expect(keep.map((r) => r.id)).toEqual(['a15'])
    expect(superseded.map((r) => r.id)).toEqual(['a30'])
  })

  it('treats the advisor’s and the client’s rows for one due date separately', () => {
    const { keep, superseded } = collapseCatchUp([
      row('c', 'i1', 15, 'client'),
      row('a', 'i1', 15, 'advisor'),
    ])
    expect(keep.map((r) => r.id).sort()).toEqual(['a', 'c'])
    expect(superseded).toEqual([])
  })

  it('treats different due dates separately', () => {
    const { keep } = collapseCatchUp([row('x', 'i1', 30), row('y', 'i2', 30)])
    expect(keep.map((r) => r.id)).toEqual(['x', 'y'])
  })

  it('keeps the input order for what it keeps', () => {
    const { keep } = collapseCatchUp([row('b', 'i2', 15), row('a', 'i1', 15), row('a30', 'i1', 30)])
    expect(keep.map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('applyCap', () => {
  it('sends up to the cap now and defers the rest, in order', () => {
    expect(applyCap([1, 2, 3, 4], 3)).toEqual({ now: [1, 2, 3], deferred: [4] })
  })

  it('defers nothing under the cap', () => {
    expect(applyCap([1], 3)).toEqual({ now: [1], deferred: [] })
  })
})
