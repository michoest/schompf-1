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

// Durchgehen wie im Laden: nach Laden und Abschnitt (Lauf-Reihenfolge), „ohne Laden“ zuerst
const storeFilter = ref(null)
const storeName = id => data.stores.find(s => s.id === id)?.name
const storageName = id => data.structure?.storageLocations.find(l => l.id === id)?.name
const groupName = id => data.groups.find(g => g.id === id)?.name
const blocks = computed(() => {
  const q = search.value.trim().toLowerCase()
  const products = data.products.filter(p => (!q || p.name.toLowerCase().includes(q)) && (!storeFilter.value || p.storeId === storeFilter.value))
  const result = []
  const unplaced = products.filter(p => !p.storeId)
  if (unplaced.length) result.push({ key: 'none', store: null, title: 'Ohne Laden', products: unplaced })
  for (const store of data.stores) {
    const inStore = products.filter(p => p.storeId === store.id)
    for (const section of [...store.sections, { id: null, name: 'Ohne Abschnitt' }]) {
      const list = inStore.filter(p => (p.sectionId ?? null) === section.id)
      if (list.length) result.push({ key: `${store.id}/${section.id}`, store, title: section.name, products: list })
    }
  }
  return result
})
const subtitle = p => [groupName(p.groupId), storageName(p.storageLocationId)].filter(Boolean).join(' · ')

const sectionsOf = storeId => data.stores.find(s => s.id === storeId)?.sections ?? []
const fallbackItems = computed(() => data.stores.filter(s => s.id !== form.value?.storeId))

function edit(product) {
  form.value = product
    ? { ...product, shelfLifeDays: product.shelfLifeDays ?? '' }
    : { id: null, name: search.value.trim(), unit: 'Stück', groupId: null, storeId: null, sectionId: null, fallbackStoreId: null,
        storageLocationId: null, isStaple: false, shelfLifeDays: '' }
  dialog.value = true
}
// Neues Produkt: Warengruppe schlägt Laden, Abschnitt, Ausweichladen und Aufbewahrung vor
function onGroupChange(groupId) {
  if (form.value.id) return
  const g = data.groups.find(x => x.id === groupId)
  if (!g) return
  const section = sectionsOf(g.preferredStoreId).find(sec => sec.groupIds.includes(g.id))
  Object.assign(form.value, { storeId: g.preferredStoreId, sectionId: section?.id ?? null, fallbackStoreId: g.fallbackStoreId, storageLocationId: g.storageLocationId })
}
function onStoreChange() {
  if (!sectionsOf(form.value.storeId).some(sec => sec.id === form.value.sectionId)) form.value.sectionId = null
  if (form.value.fallbackStoreId === form.value.storeId) form.value.fallbackStoreId = null
}

async function save() {
  busy.value = true
  const f = form.value
  const body = {
    name: f.name, unit: f.unit, groupId: f.groupId, storeId: f.storeId, sectionId: f.sectionId, fallbackStoreId: f.fallbackStoreId,
    storageLocationId: f.storageLocationId, isStaple: f.isStaple, shelfLifeDays: f.shelfLifeDays === '' ? null : Number(f.shelfLifeDays),
  }
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
    <v-text-field v-model="search" placeholder="Suchen" prepend-inner-icon="mdi-magnify" clearable hide-details class="mb-2" />
    <div class="chips mb-3">
      <v-chip size="small" :color="!storeFilter ? 'primary' : undefined" :variant="!storeFilter ? 'flat' : 'outlined'" @click="storeFilter = null">Alle</v-chip>
      <v-chip v-for="st in data.stores" :key="st.id" size="small" :color="storeFilter === st.id ? 'primary' : undefined"
        :variant="storeFilter === st.id ? 'flat' : 'outlined'" @click="storeFilter = storeFilter === st.id ? null : st.id">{{ st.name }}</v-chip>
    </div>

    <v-card v-for="b in blocks" :key="b.key" class="mb-3 block" :style="{ borderLeftColor: b.store?.color ?? 'rgb(var(--v-theme-warning))' }">
      <v-card-subtitle class="pt-3 d-flex align-center">
        <span class="font-weight-medium">{{ b.store ? `${b.store.name} › ${b.title}` : b.title }}</span>
        <v-spacer /><span class="text-caption">{{ b.products.length }}</span>
      </v-card-subtitle>
      <v-list density="compact" class="py-0">
        <v-list-item v-for="p in b.products" :key="p.id" :title="p.name" :subtitle="subtitle(p)" @click="edit(p)">
          <template #append>
            <v-icon v-if="p.isStaple" icon="mdi-home-variant" size="small" class="mr-1" title="Grundvorrat" />
            <v-icon v-if="p.shelfLifeDays" icon="mdi-clock-outline" size="small" class="mr-1" :title="`${p.shelfLifeDays} Tage haltbar`" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>
    <v-btn icon="mdi-plus" color="primary" class="fab" size="large" @click="edit(null)" />

    <v-dialog v-model="dialog" max-width="480" scrollable>
      <v-card v-if="form" :title="form.id ? form.name : 'Neues Produkt'">
        <v-card-text>
          <v-text-field v-model="form.name" label="Name" />
          <div class="text-overline mt-1">Einkaufen</div>
          <v-select v-model="form.storeId" :items="data.stores" item-title="name" item-value="id" label="Laden" clearable @update:model-value="onStoreChange" />
          <v-select v-model="form.sectionId" :items="sectionsOf(form.storeId)" item-title="name" item-value="id" label="Abschnitt" clearable :disabled="!form.storeId" />
          <v-select v-model="form.fallbackStoreId" :items="fallbackItems" item-title="name" item-value="id" label="Ausweichladen (gibt's dort nicht)" clearable />
          <div class="text-overline">Zuhause</div>
          <v-select v-model="form.storageLocationId" :items="data.structure?.storageLocations ?? []" item-title="name" item-value="id" label="Aufbewahrung" clearable />
          <v-switch v-model="form.isStaple" label="Grundvorrat (haben wir eigentlich immer)" color="primary" hide-details class="mb-2" />
          <v-text-field v-model="form.shelfLifeDays" label="Haltbarkeit in Tagen (nur wenn kurz)" inputmode="numeric" />
          <div class="text-overline">Einordnung</div>
          <v-select v-model="form.groupId" :items="data.groups" item-title="name" item-value="id" label="Warengruppe" clearable
            :hint="form.id ? '' : 'Schlägt Laden, Abschnitt und Aufbewahrung vor'" persistent-hint @update:model-value="onGroupChange" />
          <v-select v-model="form.unit" :items="data.units" item-title="singular" item-value="code" label="Übliche Einheit" class="mt-2" />
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
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.block { border-left: 4px solid transparent; }
.fab { position: fixed; right: 20px; bottom: calc(80px + env(safe-area-inset-bottom)); z-index: 4; }
</style>
