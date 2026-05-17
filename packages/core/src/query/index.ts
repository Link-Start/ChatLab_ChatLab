export { buildTimeFilter, buildSystemMessageFilter, hasTable, hasColumn } from './filters'

export {
  isChatSessionDb,
  getSessionMeta,
  getSessionOverview,
  getDatabaseSchema,
  getChatOverview,
  searchSessions,
  getSessionMessages,
  getSessionSummaries,
  buildSessionInfo,
  getSessionInfo,
  getSummaryCount,
  getLastPlatformMessageId,
} from './session-queries'
export type {
  SessionMeta,
  SessionOverview,
  SessionInfo,
  CoreSessionInfo,
  ChatOverviewData,
  SessionSearchItem,
  SessionMessagesData,
  SessionSummaryData,
} from './session-queries'

export {
  getTimeRange,
  getAvailableYears,
  getMemberActivity,
  getHourlyActivity,
  getDailyActivity,
  getWeekdayActivity,
  getMessageTypeStats,
  getMonthlyActivity,
  getYearlyActivity,
  getMessageLengthDistribution,
} from './basic-queries'
export type {
  MemberActivity,
  HourlyActivity,
  DailyActivity,
  WeekdayActivity,
  MessageTypeStats,
  MonthlyActivity,
  YearlyActivity,
  MessageLengthDistribution,
} from './basic-queries'

export {
  queryMessages,
  searchMessagesLike,
  getRecentMessages,
  getMembers,
  getMembersDetailed,
  executeReadonlySql,
  getMessageContext,
  getSearchMessageContext,
  getConversationBetween,
  getMemberNameHistory,
  getMembersWithAliases,
  executeParameterizedSql,
} from './message-queries'
export type {
  QueryMessagesOptions,
  QueryMessagesResult,
  MessageResult,
  PaginatedMessages,
  MemberDetailed,
  ContextMessage,
  ConversationData,
  MemberNameHistoryEntry,
  MemberWithAliases,
} from './message-queries'

// Shared full-message SQL, types, and mapper
export {
  FULL_MSG_COLUMNS,
  FULL_MSG_FROM,
  FULL_MSG_SELECT,
  MSG_COUNT_FROM,
  SYSTEM_MSG_FILTER,
  TEXT_ONLY_FILTER,
  mapMessageRow,
  buildMsgConditions,
} from './message-sql'
export type { FullMessageRow, MappedMessage, MsgQueryConditions } from './message-sql'

// Async SQL executor abstraction
export type { AsyncSqlExecutor } from './executor'

// Shared async message query functions (platform-agnostic)
export {
  fetchMessagesBefore,
  fetchMessagesAfter,
  searchMessagesLikeAsync,
  fetchMessageContext,
  fetchSearchMessageContext,
  fetchAllRecentMessages,
  fetchRecentTextMessages,
  fetchConversationBetween,
} from './message-query-functions'
export type { AsyncPaginatedMessages, AsyncMessagesWithTotal, AsyncConversationData } from './message-query-functions'

// Advanced analytics
export {
  getCatchphraseAnalysis,
  getMentionAnalysis,
  getMentionGraph,
  getLaughAnalysis,
  getClusterGraph,
  getRelationshipStats,
  getLanguagePreferenceAnalysis,
} from './advanced'
export type {
  CatchphraseAnalysis,
  MemberCatchphrase,
  CatchphraseItem,
  MentionGraphData,
  MentionGraphNode,
  MentionGraphLink,
  ClusterGraphData,
  ClusterGraphNode,
  ClusterGraphLink,
  ClusterGraphOptions,
  RelationshipStats,
  RelationshipMonthStats,
  IceBreakerItem,
  ResponseLatencyMember,
  PerseveranceMember,
  MonthlyResponseLatency,
  MonthlyPerseverance,
  RelationshipOptions,
  NlpProvider,
  PosTagResult,
  LanguagePreferenceParams,
} from './advanced'
