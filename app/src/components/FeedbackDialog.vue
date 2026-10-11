<script setup>
import { ref, computed, watch } from 'vue'
import api from '@/services/api'
import { useAppStore } from '@/stores'

const props = defineProps({
  modelValue: Boolean,
  dish: { type: Object, default: null },   // Anmerkung zu diesem Gericht, sonst allgemein
})
const emit = defineEmits(['update:modelValue', 'saved'])
const appStore = useAppStore()

const open = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) })
const text = ref('')
const busy = ref(false)
watch(open, v => { if (v) text.value = '' })

async function save() {
  busy.value = true
  try {
    const saved = await api.addFeedback(text.value.trim(), props.dish?.id ?? null)
    appStore.showSnackbar('Danke! Claude kümmert sich darum.')
    emit('saved', saved)
    open.value = false
  } catch (e) {
    appStore.showError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="480">
    <v-card :title="dish ? `Anmerkung zu ${dish.name}` : 'Feedback geben'">
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-3">
          {{ dish ? 'Was stimmt nicht oder soll anders sein? Z.B. „Reis war zu viel“, „Schritt 3 fehlt“, „dauert eher 60 Min.“' : 'Was fällt dir an der App auf? Fehler, Wünsche, Ideen.' }}
        </p>
        <v-textarea v-model="text" auto-grow rows="3" autofocus placeholder="Deine Anmerkung" hide-details />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Abbrechen</v-btn>
        <v-btn color="primary" variant="flat" :loading="busy" :disabled="!text.trim()" @click="save">Senden</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
