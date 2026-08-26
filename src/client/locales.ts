/** PandaClaw 舞台文案（zh 为撰写源）. */

/** 词典命名空间（注册与绑定键）. */
export const NS = 'pandaclaw'

/** 词典键形状. */
export interface PcLocaleKey {
  readonly view: {
    /** 视图页签标题. */
    readonly title: string
  }
}

/** 中文文案. */
export const zh: PcLocaleKey = {
  view: { title: '会议舞台' },
}

/** English copy. */
export const en: PcLocaleKey = {
  view: { title: 'Meetings' },
}
