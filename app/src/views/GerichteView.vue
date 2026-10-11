<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores'

const router = useRouter()
const data = useDataStore()

const search = ref('')
const filter = ref('all')
const filters = [
  { value: 'all', title: 'Alle' },
  { value: 'draft', title: 'Entwürfe' },
  { value: 'norecipe', title: 'Ohne Rezept' },
]

const dishes = computed(() => {
  const q = search.value.trim().toLowerCase()
  return data.dishes
    .filter(d => !q || d.name.toLowerCase().includes(q) || d.categories.some(c => c.toLowerCase().includes(q)))
    .filter(d => filter.value !== 'draft' || d.status === 'draft')
    .filter(d => filter.value !== 'norecipe' || (d.kind === 'cook' && !d.recipe))
})
const kindIcon = { cook: 'mdi-pot-steam-outline', buy: 'mdi-package-variant-closed', takeaway: 'mdi-moped-outline' }
</script>

<template>
  <div>
    <v-text-field v-model="search" placeholder="Suchen" prepend-inner-icon="mdi-magnify" clearable hide-details class="mb-2" />
    <v-chip-group v-model="filter" mandatory selected-class="text-primary" class="mb-2">
      <v-chip v-for="f in filters" :key="f.value" :value="f.value" size="small" variant="outlined">{{ f.title }}</v-chip>
    </v-chip-group>
    <v-card>
      <v-list density="comfortable">
        <v-list-item v-for="d in dishes" :key="d.id" :title="d.name" :subtitle="d.categories.join(', ')" :prepend-icon="kindIcon[d.kind]"
          :class="{ 'opacity-60': d.status === 'draft' }" @click="router.push(`/gericht/${d.id}`)">
          <template #append>
            <span v-if="d.totalMinutes" class="text-caption text-medium-emphasis mr-2">{{ d.totalMinutes }} Min.</span>
            <v-chip v-if="d.status === 'draft'" size="x-small" class="mr-1">Entwurf</v-chip>
            <v-icon v-if="d.kind === 'cook' && !d.recipe" icon="mdi-text-box-remove-outline" size="small" color="warning" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>
    <p class="text-caption text-medium-emphasis mt-2">{{ dishes.length }} Gerichte</p>
    <v-btn icon="mdi-plus" color="primary" class="fab" size="large" @click="router.push('/verwaltung/gerichte/neu')" />
  </div>
</template>

<style scoped>
.fab { position: fixed; right: 20px; bottom: calc(80px + env(safe-area-inset-bottom)); z-index: 4; }
</style>
