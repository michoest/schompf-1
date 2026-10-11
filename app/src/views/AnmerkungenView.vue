<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { useAppStore } from '@/stores'

const router = useRouter()
const appStore = useAppStore()
const items = ref([])
const showDone = ref(false)

const visible = computed(() => items.value.filter(f => showDone.value || f.status === 'open'))
const formatDate = iso => new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

async function load() {
  try { items.value = await api.feedback() } catch (e) { appStore.showError(e) }
}
onMounted(load)
</script>

<template>
  <div>
    <p class="text-body-2 text-medium-emphasis mb-3">
      Anmerkungen zu Gerichten und zur App. Claude liest sie aus, setzt sie um und vermerkt hier, was geändert wurde.
    </p>
    <v-switch v-model="showDone" label="Erledigte zeigen" color="primary" hide-details density="compact" class="mb-2" />
    <v-card v-for="f in visible" :key="f.id" class="mb-3" :class="{ 'opacity-70': f.status === 'done' }">
      <v-card-text>
        <div class="d-flex align-center mb-1">
          <span class="text-subtitle-2">{{ f.dishName ?? 'Allgemein' }}</span>
          <v-chip v-if="f.status === 'done'" size="x-small" color="primary" class="ml-2">erledigt</v-chip>
          <v-spacer />
          <span class="text-caption text-medium-emphasis">{{ f.person }} · {{ formatDate(f.createdAt) }}</span>
        </div>
        <div class="text-body-1" style="white-space: pre-line">{{ f.text }}</div>
        <div v-if="f.resolution" class="text-body-2 mt-2"><v-icon icon="mdi-check" size="small" color="primary" /> {{ f.resolution }}</div>
        <v-btn v-if="f.dishId" variant="text" size="small" class="mt-1 px-0" @click="router.push(`/gericht/${f.dishId}`)">Zum Gericht</v-btn>
      </v-card-text>
    </v-card>
    <p v-if="!visible.length" class="text-center text-medium-emphasis pa-6">Keine offenen Anmerkungen.</p>
  </div>
</template>
