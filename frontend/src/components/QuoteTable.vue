<script setup lang="ts">
// 报价明细表（共用组件）：一手 / 境外旅行社 / 省地接社 共用同一套价格页面。
// - pandaking：全编辑（成本① + 利润①=报价A + 利润②=对客价）
// - agency：   只读报价A 作为自身成本，可改利润②生成对客价
// - provincial：仅填成本①（利润列隐藏）；手机/PC 同页
// 与后端 role-visibility.ts 的字段级可见性一一对应。
import { computed } from 'vue'
import type { QuoteLevel, ProfitMode } from '@/types'
import { calcDerived, calcGuestPrice, itemQuoteA, profitToAmount } from '@/utils/quote'
import { genUid } from '@/utils/uid'

const props = defineProps<{
  role: 'pandaking' | 'agency' | 'provincial'
  readOnly?: boolean
}>()

const items = defineModel<QuoteLevel[]>('items', { required: true })
const profit2Mode = defineModel<ProfitMode>('profit2Mode', { default: 'amount' })
const profit2 = defineModel<number>('profit2', { default: 0 })

const QUOTE_TYPE_LABELS: Record<string, string> = {
  vehicle: '包车',
  hotel: '酒店',
  ticket: '门票',
  meal: '餐饮',
  other: '其他',
}

const isPk = computed(() => props.role === 'pandaking')
const isAgency = computed(() => props.role === 'agency')
const isProv = computed(() => props.role === 'provincial')

const canEditCost1 = computed(() => (isPk.value || isProv.value) && !props.readOnly)
const canEditProfit1 = computed(() => isPk.value && !props.readOnly)
// 利润②归境外旅行社，一手 PandaKing 永远不可编辑（仅旅行社视图可改）
const canEditProfit2 = computed(() => isAgency.value && !props.readOnly)
const canEditName = computed(() => (isPk.value || isProv.value) && !props.readOnly)
const canAdd = computed(() => (isPk.value || isProv.value) && !props.readOnly)

const costColLabel = computed(() => {
  if (isAgency.value) return '报价A（成本）'
  if (isProv.value) return '报价'
  return '成本①'
})
const profitColLabel = computed(() => '利润')
const quoteColLabel = computed(() => (isAgency.value ? '对客价' : '报价A'))

const derived = computed(() => calcDerived(items.value))
const guestPrice = computed(() => calcGuestPrice(derived.value.quoteA, profit2Mode.value, profit2.value))

function newItem(): QuoteLevel {
  return { uid: genUid(), name: '', type: 'other', cost1: 0, profit1Mode: 'amount', profit1: 0 }
}
function addItem() {
  items.value.push(newItem())
}
function removeItem(i: number) {
  items.value.splice(i, 1)
}
</script>

<template>
  <div>
    <div class="tbl-wrap">
      <table class="quote">
        <thead>
          <tr>
            <th>项目</th>
            <th>{{ costColLabel }}</th>
            <th v-if="isPk || isAgency">{{ profitColLabel }}</th>
            <th v-if="isPk || isAgency">{{ quoteColLabel }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(it, i) in items" :key="it.uid ?? i">
            <td>
              <input
                v-model="it.name"
                :placeholder="QUOTE_TYPE_LABELS[it.type || 'other'] || '项目名称'"
                :disabled="!canEditName"
              />
            </td>
            <td>
              <input
                v-if="!isAgency"
                type="number"
                v-model.number="it.cost1"
                :disabled="!canEditCost1"
              />
              <span v-else class="ro">¥{{ Math.round(itemQuoteA(it)).toLocaleString() }}</span>
            </td>
            <td v-if="isPk || isAgency">
              <template v-if="canEditProfit1">
                <select v-model="it.profit1Mode" class="mode">
                  <option value="amount">元</option>
                  <option value="percent">%</option>
                </select>
                <input type="number" v-model.number="it.profit1" />
              </template>
              <span v-else class="ro">¥0</span>
            </td>
            <td v-if="isPk || isAgency" class="ro">¥{{ Math.round(itemQuoteA(it)).toLocaleString() }}</td>
            <td>
              <button class="btn ghost sm" @click="removeItem(i)" :disabled="!canAdd">×</button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>合计</td>
            <td class="ro">¥{{ Math.round(isAgency ? derived.quoteA : derived.cost1).toLocaleString() }}</td>
            <td v-if="isPk || isAgency" class="ro">¥{{ Math.round(derived.profit1).toLocaleString() }}</td>
            <td v-if="isPk || isAgency" class="ro total">¥{{ Math.round(derived.quoteA).toLocaleString() }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <button class="btn" @click="addItem" :disabled="!canAdd">+ 添加报价项</button>

    <!-- 境外旅行社对客价（利润2）：仅旅行社视角显示；PandaKing 不应见利润②与对客价（其内部利润率保密，对客价须由旅行社加完利润② 后才有意义） -->
    <div class="guest-box" v-if="isAgency">
      <div class="guest-row">
        <span class="guest-label">我的成本（报价A）</span>
        <span class="ro">¥{{ Math.round(derived.quoteA).toLocaleString() }}</span>
      </div>
      <div class="guest-row">
        <span class="guest-label">利润</span>
        <select v-model="profit2Mode" :disabled="!canEditProfit2" class="mode">
          <option value="amount">元</option>
          <option value="percent">%</option>
        </select>
        <input type="number" v-model.number="profit2" :disabled="!canEditProfit2" />
      </div>
      <div class="guest-row total">
        <span class="guest-label">对客价</span>
        <span class="ro total">¥{{ Math.round(guestPrice).toLocaleString() }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quote { width: 100%; border-collapse: collapse; }
.quote th, .quote td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; }
.quote input, .quote select { width: 100%; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; font-size: 13px; box-sizing: border-box; }
.quote .ro { font-weight: 600; }
.quote .total { color: var(--brand); font-size: 15px; }
.tbl-wrap { overflow-x: auto; }
.quote .mode { width: auto; min-width: 56px; display: inline-block; margin-right: 4px; }
.guest-box { margin-top: 14px; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; background: var(--surface); }
.guest-row { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
.guest-label { color: var(--muted); font-size: 13px; min-width: 150px; }
.guest-row.total { border-top: 1px dashed var(--line); padding-top: 8px; margin-top: 8px; }
.guest-row.total .guest-label { color: var(--ink); font-weight: 600; }
.guest-box .mode { width: auto; min-width: 56px; }
.guest-box input[type=number] { width: 140px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; font-size: 14px; box-sizing: border-box; }
.btn.ghost.sm { padding: 2px 8px; font-size: 12px; width: auto; }
</style>
