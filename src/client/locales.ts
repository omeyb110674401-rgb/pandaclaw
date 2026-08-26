/** PandaClaw 舞台文案（zh 为撰写源）. */

/** 词典命名空间（注册与绑定键）. */
export const NS = 'pandaclaw'

/** 中文词典：平铺点路径键（与 locale 服务的单层查找约定一致）. */
export const zh = {
  'view.title': '会议舞台',
} satisfies Record<string, string>

/** 词典键形状（zh 键集为唯一真源）. */
export type PcLocaleKey = keyof typeof zh

/** English copy, key-set same as zh. */
export const en = {
  'view.title': 'Meetings',
} satisfies Record<PcLocaleKey, string>
