<script setup>
import { ref, computed, watch } from 'vue'
import api from '@/services/api'
import { useAppStore } from '@/stores'
import { shortDate } from '@/utils/format'

const props = defineProps({
  modelValue: Boolean,
  trip: { type: Object, default: null },   // bestehender Einkauf → Zeitraum ändern
})
const emit = defineEmits(['update:modelValue', 'saved'])
const appStore = useAppStore()

const open = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) })
const date = ref('')
const coversFrom = ref('')
const coversTo = ref('')
const busy = ref(false)

watch(open, async isOpen => {
  if (!isOpen) return
  if (props.trip) {
    ({ date: date.value, coversFrom: coversFrom.value, coversTo: coversTo.value } = props.trip)
  } else {
    try {
      ({ date: date.value, coversFrom: coversFrom.value, coversTo: coversTo.value } = await api.tripSuggestion())
    } catch (e) { appStore.showError(e) }
  }
})

async function save() {
  busy.value = true
  try {
    const body = { date: date.value, coversFrom: coversFrom.value, coversTo: coversTo.value }
    const list = props.trip ? await api.updateTrip(props.trip.id, body) : await api.createTrip(body)
    emit('saved', list)
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
    <v-card :title="trip ? 'Einkauf ändern' : 'Einkauf erstellen'">
      <v-card-text>
        <p v-if="!trip" class="text-body-2 mb-4">
          Alle geplanten Gerichte im Zeitraum, die noch auf keiner Liste stehen, kommen auf die Liste.
          Ändert ihr danach den Plan, fragt die App jeweils, ob die Liste mitgehen soll.
        </p>
        <v-text-field v-model="date" type="date" label="Einkaufstag" />
        <div class="d-flex ga-3">
          <v-text-field v-model="coversFrom" type="date" label="Essen von" />
          <v-text-field v-model="coversTo" type="date" label="bis" />
        </div>
        <p v-if="coversFrom && coversTo" class="text-caption text-medium-emphasis">
          Für {{ shortDate(coversFrom) }} bis {{ shortDate(coversTo) }}
        </p>
        <p v-if="!trip" class="text-caption text-medium-emphasis mt-2">Ein noch offener Einkauf wird dabei abgeschlossen.</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Abbrechen</v-btn>
        <v-btn color="primary" variant="flat" :loading="busy" @click="save">{{ trip ? 'Speichern' : 'Erstellen' }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
