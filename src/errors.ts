/**
 * PandaClaw 协议错误：工具把错误码与中文裁决理由返回给模型.
 */

/** 全部协议错误码. */
export type PcErrorCode =
  | 'MEETING_NOT_FOUND'
  | 'DUPLICATE_DOC_ID'
  | 'BAD_DOCUMENT_ID'
  | 'ROSTER_MISMATCH'
  | 'BAD_STAGE'
  | 'NOT_OPEN'
  | 'NOT_DELIBERATIVE'
  | 'ROUND_EXHAUSTED'
  | 'SEAT_FORBIDDEN'
  | 'NAME_TAKEN'
  | 'WORD_LIMIT'
  | 'STRUCTURE_FAIL'
  | 'PRE_VOTE_GATE'
  | 'VOTE_STAGE_ONLY'
  | 'STANCE_INVALID'
  | 'RULING_REQUIRED'
  | 'DUPLICATE_VOTE'
  | 'ALREADY_RECORDED'
  | 'TALLY_EMPTY'
  | 'ADJOURN_BLOCKED'
  | 'WARNING_REQUIRED'
  | 'SUPERVISION_PENDING'

/** 携带协议错误码与模型可读理由的异常. */
export class PcError extends Error {
  readonly code: PcErrorCode

  /**
   * @param code - 协议错误码.
   * @param message - 面向模型的完整裁决理由（中文，说明违反了哪条规则）.
   */
  constructor(code: PcErrorCode, message: string) {
    super(message)
    this.name = 'PcError'
    this.code = code
  }
}
