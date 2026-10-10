<script setup>
import { computed } from 'vue'
import { useDataStore } from '@/stores'

const data = useDataStore()
const groupName = id => data.groups.find(g => g.id === id)?.name ?? '?'
const storeName = id => data.stores.find(s => s.id === id)?.name ?? '–'
const storageName = id => data.structure?.storageLocations.find(l => l.id === id)?.name ?? '–'
const groupsSorted = computed(() => data.groups)
</script>

<template>
  <div>
    <p class="text-body-2 text-medium-emphasis mb-3">
      Die Struktur wird einmal eingerichtet und ändert sich selten. Änderungen bitte über Claude.
    </p>
    <h2 class="text-subtitle-1 mb-2">Läden (Lauf-Reihenfolge)</h2>
    <v-card v-for="store in data.stores" :key="store.id" class="mb-3" :style="{ borderLeft: `4px solid ${store.color}` }">
      <v-card-title class="text-subtitle-1">{{ store.name }}</v-card-title>
      <v-list density="compact" class="py-0">
        <v-list-item v-for="(section, i) in store.sections" :key="section.id" :title="`${i + 1}. ${section.name}`"
          :subtitle="section.groupIds.map(groupName).join(', ') || '–'" />
      </v-list>
    </v-card>

    <h2 class="text-subtitle-1 mb-2 mt-4">Warengruppen</h2>
    <v-card>
      <v-table density="compact">
        <thead><tr><th>Warengruppe</th><th>Zuerst</th><th>Sonst</th><th>Lagerort</th></tr></thead>
        <tbody>
          <tr v-for="g in groupsSorted" :key="g.id">
            <td>{{ g.name }}</td>
            <td>{{ storeName(g.preferredStoreId) }}</td>
            <td>{{ storeName(g.fallbackStoreId) }}</td>
            <td>{{ storageName(g.storageLocationId) }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </div>
</template>
