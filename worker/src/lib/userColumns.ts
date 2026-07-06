// Maps the master-file's original column headers (Chinese, from the source
// export) to the `users` table's schema column names. Also accepts the
// schema column names directly as keys, so a file re-exported from our own
// DB (already snake_case) maps just as well as the original upload.
const HEADER_TO_COLUMN: Record<string, string> = {
  "用户ID，主键id": "user_id",
  "代理状态(0未申请,1审核中,2申请拒绝,3申请通过": "agent_status",
  "代理用户ID": "agent_user_id",
  "上级用户ID": "superior_user_id",
  "直接上级": "direct_superior",
  "代理1级": "agent_level_1",
  "代理2级": "agent_level_2",
  "代理3级": "agent_level_3",
  "代理4级": "agent_level_4",
  "代理等级": "agent_level",
  "用户名称": "username",
  "性别": "gender",
  "手机号": "phone",
  "邮件": "email",
  "注册IP": "register_ip",
  "出生日期": "birth_date",
  "App版本号": "app_version",
  "注册设备": "register_device",
  "登录设备": "login_device",
  "注册渠道": "register_channel",
  "测试账号(0正式;1测试)": "is_test_account",
  "邀请人userID": "inviter_user_id",
  "注册来源": "register_source",
  "最后活跃时间": "last_active_time",
  "最后登录设备": "last_login_device",
  "设备id": "device_id",
  "用户状态": "user_status",
  "推送标识": "push_token",
  "会员等级": "member_level",
  "注册时版本号": "register_version",
  "渠道": "channel",
  "余额": "balance",
  "充值次数": "deposit_count",
  "查询时间": "query_time",
  "开始时间": "start_time",
  "结束时间": "end_time",
  "充值次数开始": "deposit_count_start",
  "充值次数结束": "deposit_count_end",
  "用户余额": "user_balance",
  "充值总额": "total_deposit",
  "冻结金额": "frozen_amount",
  "提现总额": "total_withdrawal",
  "提现额度": "withdrawal_limit",
  "city": "city",
  "mark": "mark",
  "Flow-up Time": "flow_up_time",
  "Next Flow-up Time": "next_flow_up_time",
  "Tag": "tag",
  "imUserId": "im_user_id",
  "imUserStatus": "im_user_status",
  "Group Name": "group_name",
  "adjustAdid": "adjust_adid",
  "imCustomer": "im_customer",
  "createTime": "create_time",
  "updateTime": "update_time",
  "packageId": "package_id",
};

// Every updatable column in `users` except the primary key itself.
export const USER_UPDATE_COLUMNS = [
  "agent_status", "agent_user_id", "superior_user_id", "direct_superior",
  "agent_level_1", "agent_level_2", "agent_level_3", "agent_level_4", "agent_level",
  "username", "gender", "phone", "email", "register_ip", "birth_date", "app_version",
  "register_device", "login_device", "register_channel", "is_test_account",
  "inviter_user_id", "register_source", "last_active_time", "last_login_device",
  "device_id", "user_status", "push_token", "member_level", "register_version",
  "channel", "balance", "deposit_count", "query_time", "start_time", "end_time",
  "deposit_count_start", "deposit_count_end", "user_balance", "total_deposit",
  "frozen_amount", "total_withdrawal", "withdrawal_limit", "city", "mark",
  "flow_up_time", "next_flow_up_time", "tag", "im_user_id", "im_user_status",
  "group_name", "adjust_adid", "im_customer", "create_time", "update_time", "package_id",
] as const;

const SCHEMA_COLUMNS = new Set<string>(["user_id", ...USER_UPDATE_COLUMNS]);

function coerce(value: unknown): string | number | null {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

export interface MappedUserRow {
  user_id: number;
  values: Record<string, string | number | null>;
}

// Converts one parsed sheet row into a { user_id, values } pair using the
// header map above. Returns null if no recognizable user_id column is found
// (caller counts these as failed rows rather than silently dropping them).
export function mapRowToUser(row: Record<string, unknown>): MappedUserRow | null {
  const values: Record<string, string | number | null> = {};

  for (const [header, raw] of Object.entries(row)) {
    const column = HEADER_TO_COLUMN[header] ?? (SCHEMA_COLUMNS.has(header) ? header : undefined);
    if (!column) continue; // unrecognized header: ignored, not an error
    values[column] = coerce(raw);
  }

  const userId = values["user_id"];
  if (userId === null || userId === undefined) return null;

  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId)) return null;

  return { user_id: numericUserId, values };
}
