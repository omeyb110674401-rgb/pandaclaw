/**
 * 质询通道模块
 * @author npc-1 (系统架构师)
 */

const { loadState, saveState } = require('./meeting-state-store');

const INQUIRY_STATUS = { PENDING: 'pending', ANSWERED: 'answered', TIMEOUT: 'timeout' };

function createInquiry(meetingId, fromNpc, toCppcc, question) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);

  const inquiryId = `inquiry-${Date.now()}`;
  const inquiry = {
    inquiryId, from: fromNpc, to: toCppcc, question, answer: null,
    status: INQUIRY_STATUS.PENDING,
    createdAt: new Date().toISOString(), answeredAt: null, timeout: 60000
  };

  if (!state.inquiries) state.inquiries = {};
  state.inquiries[inquiryId] = inquiry;
  saveState(state);
  return inquiry;
}

function answerInquiry(meetingId, inquiryId, answer) {
  const state = loadState(meetingId);
  if (!state) throw new Error(`会议不存在: ${meetingId}`);

  const inquiry = state.inquiries?.[inquiryId];
  if (!inquiry) throw new Error(`质询不存在: ${inquiryId}`);
  if (inquiry.status !== INQUIRY_STATUS.PENDING) throw new Error(`质询已处理`);

  inquiry.answer = answer;
  inquiry.status = INQUIRY_STATUS.ANSWERED;
  inquiry.answeredAt = new Date().toISOString();
  saveState(state);
  return inquiry;
}

function getPendingInquiries(meetingId, cppccId) {
  const state = loadState(meetingId);
  if (!state || !state.inquiries) return [];
  return Object.values(state.inquiries).filter(i => i.to === cppccId && i.status === INQUIRY_STATUS.PENDING);
}

function formatInquiryMessage(inquiry) {
  return `【质询通知】\n人大代表 ${inquiry.from} 向你发起质询：\n**问题：** ${inquiry.question}\n请在60秒内回复。`;
}

function formatAnswerNotification(inquiry) {
  return `【质询回复】\n政协委员 ${inquiry.to} 已回复：\n**问题：** ${inquiry.question}\n**回复：** ${inquiry.answer}`;
}

function checkTimeoutInquiries(meetingId) {
  const state = loadState(meetingId);
  if (!state || !state.inquiries) return [];

  const now = Date.now();
  const timeoutIds = [];
  for (const [id, inquiry] of Object.entries(state.inquiries)) {
    if (inquiry.status === INQUIRY_STATUS.PENDING && now - new Date(inquiry.createdAt).getTime() > inquiry.timeout) {
      inquiry.status = INQUIRY_STATUS.TIMEOUT;
      timeoutIds.push(id);
    }
  }
  if (timeoutIds.length > 0) saveState(state);
  return timeoutIds;
}

module.exports = {
  createInquiry, answerInquiry, getPendingInquiries,
  formatInquiryMessage, formatAnswerNotification, checkTimeoutInquiries,
  INQUIRY_STATUS
};