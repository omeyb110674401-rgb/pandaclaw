/**
 * The Pandaclaw executor's contract: it only queues, it reports through the
 * Engine, and it never turns a refusal into a failure.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  DELIVERY_KIND, LAUNCH_KIND, PandaclawExecutor,
  type MeetingHost, type PandaclawExecutorHost,
} from '../src/executor/pandaclaw.ts'
import type { Assignment, Ticket } from '../src/core/model.ts'

const ticket = { id: 't1' } as unknown as Ticket
const assignment = { id: 'a1' } as unknown as Assignment

/** A queue that records enqueues and runs handlers on demand. */
function fakeQueue() {
  const handlers = new Map<string, (payload: any) => Promise<void>>()
  const queued: { kind: string; key: string; payload: unknown }[] = []
  return {
    queued,
    enqueue(kind: string, key: string, payload: unknown) { queued.push({ kind, key, payload }) },
    handle(kind: string, run: (payload: any) => Promise<void>) { handlers.set(kind, run) },
    run(kind: string, payload: unknown) { return handlers.get(kind)!(payload) },
  }
}

function fakeEngine() {
  return {
    assignmentStarted: vi.fn(),
    inputsDelivered: vi.fn(),
    deliveryFailed: vi.fn(),
    report: vi.fn(),
  }
}

function harness(overrides: Partial<{ paused: boolean; closing: boolean }> = {}) {
  const queue = fakeQueue()
  const engine = fakeEngine()
  const meetings: MeetingHost = {
    convene: vi.fn(async () => ({ meetingId: 'm1' })),
    deliver: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  }
  const host: PandaclawExecutorHost = {
    engine,
    queue,
    meetings,
    closing: () => overrides.closing ?? false,
    paused: () => overrides.paused ?? false,
  }
  return { queue, engine, meetings, executor: new PandaclawExecutor(host) }
}

describe('PandaclawExecutor', () => {
  it('queues the launch instead of convening inline', () => {
    const { queue, meetings, executor } = harness()
    executor.start(ticket, assignment)
    expect(meetings.convene).not.toHaveBeenCalled()
    expect(queue.queued).toEqual([{ kind: LAUNCH_KIND, key: 'a1', payload: { ticketId: 't1', assignmentId: 'a1' } }])
  })

  it('convenes on the queued launch and reports assignmentStarted', async () => {
    const { queue, engine, meetings, executor } = harness()
    executor.start(ticket, assignment)
    await queue.run(LAUNCH_KIND, queue.queued[0]!.payload)
    expect(meetings.convene).toHaveBeenCalledTimes(1)
    expect(engine.assignmentStarted).toHaveBeenCalledWith('t1', 'a1')
    expect(executor.meetingOf('t1')).toBe('m1')
  })

  it('reports a failed meeting as a failed report, not a throw', async () => {
    const { queue, engine, meetings, executor } = harness()
    ;(meetings.convene as any).mockRejectedValueOnce(new Error('no quorum'))
    executor.start(ticket, assignment)
    await queue.run(LAUNCH_KIND, queue.queued[0]!.payload)
    expect(engine.report).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'failed', error: 'no quorum' }))
    expect(executor.meetingOf('t1')).toBeUndefined()
  })

  it('defers a launch while processing is paused', async () => {
    const { queue, engine, meetings, executor } = harness({ paused: true })
    executor.start(ticket, assignment)
    await expect(queue.run(LAUNCH_KIND, queue.queued[0]!.payload)).rejects.toThrow('paused')
    expect(meetings.convene).not.toHaveBeenCalled()
    expect(engine.report).not.toHaveBeenCalled()
  })

  it('forwards stop to the running meeting once', async () => {
    const { queue, meetings, executor } = harness()
    executor.start(ticket, assignment)
    await queue.run(LAUNCH_KIND, queue.queued[0]!.payload)
    executor.stop(ticket, assignment, 'a person stopped it')
    executor.stop(ticket, assignment, 'again')
    expect(meetings.stop).toHaveBeenCalledTimes(1)
    expect(meetings.stop).toHaveBeenCalledWith('m1', 'a person stopped it')
  })

  it('does not deliver into a meeting that has not started', async () => {
    const { queue, executor } = harness()
    executor.deliver(ticket, assignment)
    expect(queue.queued[0]).toEqual({ kind: DELIVERY_KIND, key: 't1', payload: { ticketId: 't1' } })
    await expect(queue.run(DELIVERY_KIND, queue.queued[0]!.payload)).rejects.toThrow('not running')
  })
})
