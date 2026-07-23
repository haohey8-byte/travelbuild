<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listCostInquiries } from '@/api/routes'
import { costInquiryH5Url } from '@/utils/share'
import type { CostInquiry } from '@/types'

const myInquiries = ref<CostInquiry[]>([])
const loading = ref(false)

onMounted(load)
async function load() {
  loading.value = true
  try {
    myInquiries.value = await listCostInquiries()
  } catch {
    myInquiries.value = []
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h2 class="section-title">我的询价</h2>
    <p class="muted">PandaKing 发来的成本询价会出现在这里，点开 H5 填写地接成本①即可回传。</p>

    <p v-if="loading">加载中…</p>
    <div v-else class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>路线</th><th>状态</th><th>报价</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="ci in myInquiries" :key="ci.id">
            <td>{{ ci.routeId.slice(0, 8) }}</td>
            <td>{{ ci.status === 'submitted' ? '已回传' : '待回传' }}</td>
            <td>{{ ci.cost1 != null ? '¥' + Number(ci.cost1).toLocaleString() : '-' }}</td>
            <td>
              <a v-if="ci.token" :href="costInquiryH5Url(ci.token)" target="_blank" class="link">打开询价 H5 ↗</a>
              <span v-else class="muted">-</span>
            </td>
          </tr>
          <tr v-if="!myInquiries.length"><td colspan="4" class="muted">暂无询价</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.section-title { margin: 0 0 4px; font-size: 20px; }
.muted { color: var(--muted); font-size: 13px; }
.tbl-wrap { margin-top: 12px; }
.tbl { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; }
.tbl th, .tbl td { padding: 10px 14px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; }
.tbl th { background: var(--bg); color: var(--muted); }
.link { color: var(--brand); font-weight: 600; text-decoration: none; }
</style>
