<script setup>
import { ref, computed, watch } from 'vue'
import api from '@/services/api'
import { useAppStore } from '@/stores'
import { shortDate, today } from '@/utils/format'

// „Plan übernehmen“: geplante Gerichte von heute bis zum gewählten Tag kommen auf die Einkaufsliste
const props = defineProps({
  modelValue: Boolean,
  trip: { type: Object, default: null },   // aktueller Einkauf (für „bisher bis …“)
})
const emit = defineEmits(['update:modelValue', 'saved'])
const appStore = useAppStore()

const open = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) })
const to = ref('')
const busy = ref(false)

watch(open, async isOpen => {
  if (!isOpen) return
  try {
    to.value = (await api.tripSuggestion()).planTo
  } catch (e) { appStore.showError(e) }
})

async function save() {
  busy.value = true
  try {
    emit('saved', await api.takeOverPlan(to.value))
    open.value = false
  } catch (e) {
    appStore.showError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="420">
    <v-card title="Plan übernehmen">
      <v-card-text>
        <p class="text-body-2 mb-4">
          Alle geplanten Gerichte von heute bis zum gewählten Tag, die noch nicht auf der Liste stehen
          und noch nicht zubereitet sind, kommen auf die Einkaufsliste.
        </p>
        <v-text-field v-model="to" type="date" label="Essen bis einschließlich" :min="today()" />
        <p v-if="to" class="text-caption text-medium-emphasis">Heute bis {{ shortDate(to) }}</p>
        <p v-if="trip?.planTakenAt" class="text-caption text-medium-emphasis mt-2">Bisher übernommen bis {{ shortDate(trip.coversTo) }}.</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Abbrechen</v-btn>
        <v-btn color="primary" variant="flat" :loading="busy" :disabled="!to" @click="save">Übernehmen</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
