<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchInvite, acceptInvite } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { roleLabel } from '@/utils/share'
import type { Invite } from '@/types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const token = (route.params.token as string) || ''
const invite = ref<Invite | null>(null)
const loading = ref(true)
const loadErr = ref('')
const name = ref('')
const busy = ref(false)
const done = ref(false)
const acceptErr = ref('')

const levelLabel = computed(() =>
  invite.value?.level === 'admin' ? '机构管理员' : '机构员工',
)

onMounted(async () => {
  try {
    invite.value = await fetchInvite(token)
  } catch (e: any) {
    loadErr.value = e?.response?.data?.message || '邀请无效或已失效'
  } finally {
    loading.value = false
  }
})

async function onAccept() {
  if (!name.value.trim()) {
    acceptErr.value = '请填写你的名称'
    return
  }
  acceptErr.value = ''
  busy.value = true
  try {
    await auth.loginByInvite(token, name.value.trim())
    done.value = true
    setTimeout(() => router.replace('/routes/kanban'), 600)
  } catch (e: any) {
    acceptErr.value = e?.response?.data?.message || '接受邀请失败，链接可能已使用或过期'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="h5-invite">
    <div class="card">
      <div class="brand">PandaKing9</div>
      <div class="brand-sub">入境游定制协作工作台</div>

      <p v-if="loading" class="muted">邀请校验中…</p>

      <template v-else-if="loadErr">
        <div class="state err">{{ loadErr }}</div>
      </template>

      <template v-else-if="invite">
        <div class="invite-head">你收到一条协作邀请</div>
        <div class="kv"><span>机构角色</span><b>{{ roleLabel(invite.role) }}</b></div>
        <div class="kv"><span>邀请层级</span><b>{{ levelLabel }}</b></div>
        <div class="kv" v-if="invite.agencyId"><span>机构编号</span><b>{{ invite.agencyId }}</b></div>

        <template v-if="!done">
          <input
            v-model="name"
            class="input"
            placeholder="填写你的名称（用于协作显示）"
            @keyup.enter="onAccept"
          />
          <button class="btn btn-primary block" :disabled="busy" @click="onAccept">
            {{ busy ? '处理中…' : '接受邀请并进入' }}
          </button>
          <p v-if="acceptErr" class="err">{{ acceptErr }}</p>
          <p class="tip">接受后将以该机构成员身份登录，可复制协作 H5 到微信群与一手对接。</p>
        </template>

        <div v-else class="state ok">已加入，正在进入工作台…</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.h5-invite { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: var(--bg); }
.card { width: 100%; max-width: 380px; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 24px; }
.brand { font-weight: 800; color: var(--brand); font-size: 20px; letter-spacing: -0.02em; }
.brand-sub { color: var(--muted); font-size: 13px; margin: 4px 0 14px; }
.invite-head { font-size: 15px; font-weight: 700; margin: 6px 0 14px; }
.kv { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.kv span { color: var(--muted); }
.input { width: 100%; margin: 16px 0 10px; padding: 11px 12px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); font-size: 14px; }
.btn-primary { background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 12px; font-weight: 700; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; }
.block { width: 100%; }
.muted { color: var(--muted); font-size: 13px; }
.err { color: var(--danger); font-size: 13px; }
.tip { color: var(--muted); font-size: 12px; margin-top: 12px; line-height: 1.5; }
.state { border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 600; }
.state.err { background: #fdecec; color: var(--danger); }
.state.ok { background: var(--brand-50); color: var(--brand); }
</style>
