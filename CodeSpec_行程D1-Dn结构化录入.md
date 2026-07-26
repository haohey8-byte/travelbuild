# CodeSpec: 行程 D1-Dn 结构化录入（全字段：城市 / 酒店 / 景点 / 餐饮 / 备注）

> 需求来源：境外旅行社 H5 提单页 + 控制台"+ 新建路线"弹窗，需增加按 D1-Dn 的结构化填写入库（不强制），与后续多轮协作的行程编辑保持数据一致。
> 用户已拍板录入粒度：**按原设计字段，城市、酒店、景点、餐食、备注**（即全字段录入，非仅城市）。
> 关联：RouteDetail / H5Route / H5ProvincialRoute 三处编辑器的 canonical `Day` 数据模型。

## 1. 背景 (Why)
当前两个创建入口（H5 提单、控制台"+ 新建路线"）的"行程/需求描述"只有一行 textarea，提交时被打包成 `itinerary: { note: '...' }` 存入 `RouteVersion v1 draft`。但后续协作编辑器（RouteDetail / H5Route / H5ProvincialRoute）的 `parseItinerary()` 只识别 `{ days: Day[] }`，否则回退空白 Day1——**这段 note 在 PandaKing 打开详情时就被静默丢弃，等于数据死掉**。

而 PandaKing 在详情页只能从空白 Day1 开始排，旅行社原本的行程意图完全丢失，多轮协作起点错位。

本次改为结构化 D1-Dn 全字段录入，让录入阶段即可沉淀城市/酒店/景点/餐饮/备注，且与三处编辑器共用同一 `Day` 形状，数据在「提单 → 详情编辑 → 多轮协作」全程一致。

## 2. 范围 (Scope)

### P0 本次必须做
1. **H5Intake.vue** —— 移除"行程/需求描述" textarea；改为 **D1-Dn 全字段录入列表**（城市 / 酒店 / 景点[可增删] / 餐饮[可增删] / 备注），默认 D1；"+ 添加一天"按钮；非必填，可全空提交。
2. **RouteKanban.vue "+ 新建路线"弹窗** —— 同样补上 D1-Dn 全字段录入；提交调用 `createRoute(payload)` 时通过 `initialDraft.itinerary` 传给后端（接口已预留，未启用）。
3. **数据对齐** —— 录入阶段产出 canonical `{ days: [{ day, city, spots[], hotel, meals[], notes? }] }`，与三处编辑器 100% 兼容（编辑器 `parseItinerary` 用 `days.map((d, i) => ({ ...d, day: i+1 }))` 鲁棒加载，保留全部字段）。
4. **三编辑器加 `notes?` 字段** —— `Day` 接口与 `newDay()` 增加 `notes: ''`；RouteDetail / H5Route(可编辑+只读) / H5ProvincialRoute(可编辑+只读预览) 各加「备注」编辑输入与只读展示。H5Route 的泰语翻译纳入备注。
5. **加载验证** —— PandaKing 打开 intake/控制台创建的路线，RouteDetail 编辑器自动加载 v1 draft 的 days（含空 spots/hotel/meals/notes），可直接继续编辑。

### Non-Goals（本次不做）
- 不改后端 `create` / `submitIntake` / `saveVersion`（已支持任意 `itinerary` JSON 透传；录入端直接发 `{ days }` 即可）。
- 不做旧 `itinerary: { note }` 数据的迁移（旧路线进入详情仍见空白 Day1，与现状一致；不引入兼容垫片以免污染多轮 diff）。
- **不改 `diffQuoteChanges` 的行程变更检测逻辑** —— 当前仅对比 `day.city` 生成 `cityChanges`（用于变更摘要）。`notes` 视为描述性补充信息，不进入「 contractual 变更摘要」。录入的 notes 仍会随完整 `itinerary.value` 持久化，只是不触发变更提醒。若后续需要 notes 进入 diff，单独评估。

## 3. 用户故事 (User Stories)
- 作为**境外旅行社**，我希望 H5 提单时按 D1/D2... 填写每个停留的城市、酒店、景点、餐饮与备注，以便 PandaKing 看到清晰的逐日结构，而不是一段含糊的自由文本。
- 作为**PandaKing**，我希望打开旅行社提交的路线时，详情页直接显示旅行社填的 D1-Dn 全字段（空字段留空待补全），以便快速进入补全与报价，而不是从零排起。
- 作为**境外旅行社 / PandaKing**，我希望 H5 提单和控制台"+ 新建路线"的 D1-Dn 输入完全一致，以便协作直觉统一。
- (Edge) **境外旅行社**：若客户只定了大致天数但未定每站细节，我希望只填 D1 城市甚至全空提交，PandaKing 后续与我沟通补充。

## 4. 数据模型 (Data Model)
存储位置：`RouteVersion.itinerary`（已有 JSON 字段，无需迁移）。

```ts
// 录入端与编辑端共用
interface Day {
  day: number
  city: string
  spots: string[]
  hotel: string
  meals: string[]
  notes?: string
}
interface Itinerary { days: Day[] }
```

录入阶段可填任意字段；空字段保持空串/空数组。编辑器已对此鲁棒（`spots:['']` / `meals:['']` 视为空）。

**提交规则**：录入端仅在有任何字段（city/hotel/notes/spots/meals 任一非空）时才把 `itinerary` 入库；全空则不写（保持与「未填行程」语义一致，PandaKing 打开见空白 Day1）。

## 5. 验收 (Acceptance)
- [ ] H5 提单页：textarea 消失；D1 全字段卡片（城市/酒店/景点[可增删]/餐饮[可增删]/备注）+ "+ 添加一天"按钮存在；D1 默认展开；可全空提交。
- [ ] H5 提交 → 后端 → v1 draft itinerary = `{ days: [{ day:1, city:'...', spots:[...], hotel:'...', meals:[...], notes:'...' }, ...] }`，按填入顺序连续编号 1..n；仅在有内容时入库。
- [ ] PandaKing 打开该路线详情页：RouteDetail 编辑器显示 v1 的 days（含 notes），可直接继续修改/添加/删除/进入报价。
- [ ] RouteDetail / H5Route / H5ProvincialRoute 编辑器：Day 含「备注」编辑输入（可编辑态）与只读展示（只读态）；H5Route 泰语翻译含备注。
- [ ] 控制台"+ 新建路线"：同样 D1-Dn 全字段输入；提交时 `payload.initialDraft = { itinerary: { days } }`（有内容才加）。
- [ ] `pnpm --filter frontend run build` 通过；类型与三处编辑器一致。
- [ ] 不破坏既有协作回路（agency/provincial 仍按现有 editor 加载 days；notes 随完整 itinerary 透传）。

## 6. 风险与缓解
- **输入天数过多（>50）** → UI 滚动/可读性差；缓解：modal 已有 `max-height + overflow`；H5 页自然滚动。
- **录入端全字段 vs 编辑器字段漂移** → 共用 `@/types` 的 `ItineraryDay` 形状；编辑器本地 `Day` 同步加 `notes?`，保持兼容。
- **旧 `{ note }` 数据** → 不迁移；进入详情仍见空白 Day1（与现状一致），用户不会感知回退。
- **改动纪律** —— 同时改两个录入入口 + 三处编辑器统一加 `notes?`，沿用 canonical 形状，避免「H5 能填控制台不能填」或反之的不一致。

## 7. 决策记录 (Decision Log)
1. **录入粒度**：用户拍板 **全字段（城市、酒店、景点、餐食、备注）**，非仅城市。
   - 理由：原 textarea 承载的"偏好/特殊需求"诉求应保留为「备注」字段；酒店/景点/餐饮在提单阶段若能填则填，填不了留空由 PandaKing 补全——这正是多轮协作的价值，且编辑器已支持这些字段，无额外建模成本。
   - 代价：给 `Day` 增加 `notes?`，三处编辑器各加一处备注输入/展示，H5Route 泰语翻译纳入备注；`diffQuoteChanges` 维持仅比 city（notes 不进变更摘要）。
