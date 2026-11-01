/**
 * PandaclawExecutor: the second Executor implementation.
 *
 * A Ticket whose work is a meeting rather than a coding task runs here. The
 * `Executor` contract is three queue-only methods; the meeting kernel behind
 * `MeetingHost` owns everything else (stages, tallies, seats, review).
 *
 * Nothing in this file knows how a meeting works. It knows only that a meeting
 * can be convened, given inputs, and stopped — and that its outcome comes back
 * as an Engine report, exactly as a DSH Session's would.
 */
import type { Assignment, Ticket } from '../core/model.ts'
import type { Executor } from '../core/ports.ts'
import { Later } from '../app/effects.ts'

/** What a Ticket carries into a meeting; assembled from its Mandate. */
export interface MeetingRequest {
  readonly ticketId: string
  readonly title: string
  /** The scope the Mandate allows; the kernel turns it into a meeting type and roster. */
  readonly scope: string
  readonly mandate: {
    readonly policyVersion: string
    readonly strength: 'explicit' | 'inferred'
    readonly rules: readonly string[]
  }
  /** Directory the kernel may use for agenda files; not a checkout. */
  readonly directory: string
}

/** One thing a person or an event added to a running meeting. */
export interface MeetingInput {
  readonly ticketId: string
  readonly inputId: string
  readonly text: string
}

/** The handle a convened meeting returns. */
export interface MeetingHandle {
  readonly meetingId: string
}

/**
 * The seam the meeting package implements (`packages/meeting`).
 *
 * Kept to three calls on purpose: convene, deliver, stop. Everything the
 * meeting does between them — proposing, deliberating, voting, reviewing — is
 * its own business, and reports back through the Engine like any other worker.
 */
export interface MeetingHost {
  convene(request: MeetingRequest): Promise<MeetingHandle>
  deliver(meetingId: string, inputs: readonly MeetingInput[]): Promise<void>
  stop(meetingId: string, reason: string): Promise<void>
}

/** What the executor needs from the host; narrower than `ExecutorHost` on purpose. */
export interface PandaclawExecutorHost {
  /** Where the executor reports what happened to an Assignment. */
  readonly engine: EngineCallbacks
  /** Durable queue: launches and input deliveries are stored first, run after commit. */
  readonly queue: EffectQueue
  /** The meeting kernel. */
  readonly meetings: MeetingHost
  closing(): boolean
  paused(): boolean
}

/** The Engine methods this executor may call; a `Pick` of the real surface. */
export interface EngineCallbacks {
  assignmentStarted(ticketId: string, assignmentId: string): void
  inputsDelivered(ticketId: string, assignmentId: string, inputIds: readonly string[]): void
  deliveryFailed(ticketId: string, assignmentId: string, error: string): void
  report(ticketId: string, report: MeetingReport): void
}

/** A `Pick` of the real Effects queue, so tests can supply a plain fake. */
export interface EffectQueue {
  enqueue(kind: string, key: string, payload: unknown): void
  handle(
    kind: string,
    run: (payload: any) => Promise<void>,
    options?: { readonly limit?: () => number; readonly quiet?: boolean },
  ): void
}

/** The outcome a meeting reports; the shape matches an Executor Report. */
export type MeetingReport =
  | { status: 'progress'; summary: string }
  | { status: 'waiting'; summary: string }
  | { status: 'blocked'; summary: string; question?: string }
  | { status: 'ready'; summary: string }
  | { status: 'dropped'; summary: string }
  | { status: 'failed'; summary: string; error: string }

export const LAUNCH_KIND = 'meeting-launch'
export const DELIVERY_KIND = 'meeting-delivery'

/**
 * Runs a Ticket as a meeting.
 *
 * Both methods only queue work: the Engine calls them inside its own
 * transactions, and the queue runs the handlers after commit. A launch that
 * cannot run yet throws {@link Later}, which defers it without counting a
 * failure — the same contract the DSH executor keeps for a full worker slot.
 */
export class PandaclawExecutor implements Executor {
  /** Meeting ids by ticket, so a delivery knows which meeting to feed. */
  private readonly live = new Map<string, string>()

  constructor(private readonly host: PandaclawExecutorHost) {
    host.queue.handle(LAUNCH_KIND, payload => this.launch(payload), {
      limit: () => (host.paused() ? 0 : 1),
    })
    host.queue.handle(DELIVERY_KIND, payload => this.deliverQueued(payload), {
      limit: () => (host.paused() ? 0 : 4),
      quiet: true,
    })
  }

  /** Queue the meeting's launch; the outcome arrives as `assignmentStarted` or a `failed` report. */
  start(ticket: Ticket, assignment: Assignment): void {
    this.host.queue.enqueue(LAUNCH_KIND, assignment.id, {
      ticketId: ticket.id,
      assignmentId: assignment.id,
    })
  }

  /** Queue delivery of the ticket's waiting Inputs into the running meeting. */
  deliver(ticket: Ticket, _assignment: Assignment): void {
    this.host.queue.enqueue(DELIVERY_KIND, ticket.id, { ticketId: ticket.id })
  }

  /**
   * Stop the meeting. The domain has already ended the assignment, so this only
   * asks the kernel to wind down; a kernel that cannot stop in time still ends
   * with the assignment.
   */
  stop(ticket: Ticket, _assignment: Assignment, reason: string): void {
    const meetingId = this.live.get(ticket.id)
    if (meetingId === undefined) return
    this.live.delete(ticket.id)
    void this.host.meetings.stop(meetingId, reason).catch(() => undefined)
  }

  /** The meeting id a ticket is running as, for tests and diagnostics. */
  meetingOf(ticketId: string): string | undefined {
    return this.live.get(ticketId)
  }

  private async launch(payload: { ticketId: string; assignmentId: string }): Promise<void> {
    if (this.host.closing()) throw new Later('The host is shutting down')
    if (this.host.paused()) throw new Later('Processing is paused')
    const { ticketId, assignmentId } = payload
    // TODO(P2): read the Ticket and its Mandate from the store once the host
    // exposes a ticket reader; the skeleton passes them in from the caller.
    const request = this.requestFor(ticketId)
    try {
      const handle = await this.host.meetings.convene(request)
      this.live.set(ticketId, handle.meetingId)
      this.host.engine.assignmentStarted(ticketId, assignmentId)
    } catch (error) {
      this.host.engine.report(ticketId, {
        status: 'failed',
        summary: 'The meeting could not be convened',
        error: message(error),
      })
    }
  }

  private async deliverQueued(payload: { ticketId: string }): Promise<void> {
    const { ticketId } = payload
    const meetingId = this.live.get(ticketId)
    const assignmentId = this.assignmentOf(ticketId)
    if (meetingId === undefined || assignmentId === undefined) {
      throw new Later('The meeting is not running yet')
    }
    // TODO(P2): read the ticket's undelivered Inputs from the store.
    const inputs: readonly MeetingInput[] = []
    try {
      await this.host.meetings.deliver(meetingId, inputs)
      this.host.engine.inputsDelivered(ticketId, assignmentId, inputs.map(input => input.inputId))
    } catch (error) {
      this.host.engine.deliveryFailed(ticketId, assignmentId, message(error))
    }
  }

  /** Overridden by the host wiring once the store reader lands (TODO P2). */
  private requestFor(ticketId: string): MeetingRequest {
    return {
      ticketId,
      title: ticketId,
      scope: '',
      mandate: { policyVersion: '', strength: 'explicit', rules: [] },
      directory: '',
    }
  }

  /** Overridden by the host wiring once the store reader lands (TODO P2). */
  private assignmentOf(_ticketId: string): string | undefined {
    return undefined
  }
}

/** Error text for a report; never throws on a non-Error rejection. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
