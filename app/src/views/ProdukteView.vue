<script setup>
import { ref, computed } from 'vue'
import api from '@/services/api'
import { useAppStore, useDataStore } from '@/stores'

const appStore = useAppStore()
const data = useDataStore()

const search = ref('')
const dialog = ref(false)
const form = ref(null)
const busy = ref(false)

const groups = computed(() => {
  const q = search.value.trim().toLowerCase()
  const products = data.products.filter(p => !q || p.name.toLowerCase().includes(q))
  const result = data.groups.map(g => ({ ...g, products: products.filter(p => p.groupId === g.id) }))
  const ungrouped = products.filter(p => !p.groupId)
  if (ungrouped.length) result.push({ id: null, name: 'Ohne Warengruppe', products: ungrouped })
  return result.filter(g => g.products.length)
})
const sectionItems = computed(() => [
  { title: '– (Regel der Warengruppe)', value: null },
  ...data.stores.flatMap(s => s.sections.map(sec => ({ title: `${s.name} › ${sec.name}`, value: sec.id }))),
])

function edit(product) {
  form.value = product
    ? { ...product, shelfLifeDays: product.shelfLifeDays ?? '' }
    : { id: null, name: search.value.trim(), unit: 'Stück', groupId: null, sectionId: null, isStaple: false, shelfLifeDays: '' }
  dialog.value = true
}

async function save() {
  busy.value = true
  const f = form.value
  const body = { name: f.name, unit: f.unit, groupId: f.groupId, sectionId: f.sectionId, isStaple: f.isStaple, shelfLifeDays: f.shelfLifeDays === '' ? null : Number(f.shelfLifeDays) }
  try {
    if (f.id) await api.updateProduct(f.id, body)
    else await api.createProduct(body)
    await data.reloadProducts()
    dialog.value = false
  } catch (e) {
    appStore.showError(e)
  } finally {
    busy.value = false
  }
}

async function remove() {
  try {
    await api.deleteProduct(form.value.id)
    await data.reloadProducts()
    dialog.value = false
  } catch (e) {
    appStore.showError(e)
  }
}
</script>

<template>
  <div>
    <v-text-field v-model="search" placeholder="Suchen" prepend-inner-icon="mdi-magnify" clearable hide-details class="mb-3" />
    <v-card v-for="g in groups" :key="g.id ?? 'none'" class="mb-3">
      <v-card-subtitle class="pt-3 font-weight-medium">{{ g.name }}</v-card-subtitle>
      <v-list density="compact" class="py-0">
        <v-list-item v-for="p in g.products" :key="p.id" :title="p.name" @click="edit(p)">
          <template #append>
            <v-icon v-if="p.isStaple" icon="mdi-home-variant" size="small" class="mr-1" title="Grundvorrat" />
            <v-icon v-if="p.shelfLifeDays" icon="mdi-clock-outline" size="small" class="mr-1" :title="`${p.shelfLifeDays} Tage haltbar`" />
            <v-icon v-if="p.sectionId" icon="mdi-store-marker-outline" size="small" class="mr-1" title="eigener Laden" />
            <span class="text-caption text-medium-emphasis">{{ p.unit }}</span>
          </template>
        </v-list-item>
      </v-list>
    </v-card>
    <v-btn icon="mdi-plus" color="primary" class="fab" size="large" @click="edit(null)" />

    <v-dialog v-model="dialog" max-width="460">
      <v-card v-if="form" :title="form.id ? form.name : 'Neues Produkt'">
        <v-card-text>
          <v-text-field v-model="form.name" label="Name" />
          <v-select v-model="form.unit" :items="data.units" item-title="singular" item-value="code" label="Übliche Einheit" />
          <v-select v-model="form.groupId" :items="data.groups" item-title="name" item-value="id" label="Warengruppe" clearable />
          <v-select v-model="form.sectionId" :items="sectionItems" label="Ausnahme: immer hier kaufen" />
          <v-text-field v-model="form.shelfLifeDays" label="Haltbarkeit in Tagen (nur wenn kurz)" inputmode="numeric" />
          <v-switch v-model="form.isStaple" label="Grundvorrat (haben wir eigentlich immer)" color="primary" hide-details />
          <p v-if="form.usedIn" class="text-caption text-medium-emphasis mt-2">In {{ form.usedIn }} Gericht(en) verwendet.</p>
        </v-card-text>
        <v-card-actions>
          <v-btn v-if="form.id && !form.usedIn" color="error" variant="text" @click="remove">Löschen</v-btn>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">Abbrechen</v-btn>
          <v-btn color="primary" variant="flat" :loading="busy" @click="save">Speichern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.fab { position: fixed; right: 20px; bottom: calc(80px + env(safe-area-inset-bottom)); z-index: 4; }
</style>
