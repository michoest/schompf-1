<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useAppStore } from '@/stores'

const appStore = useAppStore()

// Build time from vite
const buildTime = computed(() => {
  try {
    const buildDate = new Date(__BUILD_TIME__)
    return buildDate.toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return 'Unbekannt'
  }
})

// Settings state (would normally be fetched from backend)
const mealSlots = ref([
  { id: 'breakfast', name: 'Frühstück', order: 0 },
  { id: 'lunch', name: 'Mittagessen', order: 1 },
  { id: 'dinner', name: 'Abendessen', order: 2 },
])

const customSlotNames = [
  'Brotzeit', 'Snack', 'Mitnehmen', 'Kaffee', 'Dessert'
]

const defaultServings = ref(2)
const defaultFreshnessDays = ref(7)
const deviceUserName = ref('')

const showAddSlotDialog = ref(false)
const newSlotName = ref('')
const showAdvancedSettings = ref(false)

// Load settings from localStorage on mount
onMounted(() => {
  const savedUserName = localStorage.getItem('deviceUserName')
  if (savedUserName) {
    deviceUserName.value = savedUserName
  }
})

// Auto-save device user name
watch(deviceUserName, (newValue) => {
  localStorage.setItem('deviceUserName', newValue)
})

// Actions
function addMealSlot() {
  if (!newSlotName.value.trim()) return

  const newSlot = {
    id: `custom-${Date.now()}`,
    name: newSlotName.value.trim(),
    order: mealSlots.value.length
  }

  mealSlots.value.push(newSlot)
  showAddSlotDialog.value = false
  newSlotName.value = ''
  appStore.showSnackbar('Mahlzeit hinzugefügt')
}

function removeMealSlot(slot) {
  if (mealSlots.value.length <= 1) {
    appStore.showSnackbar('Mindestens eine Mahlzeit erforderlich', 'warning')
    return
  }

  mealSlots.value = mealSlots.value.filter(s => s.id !== slot.id)
  // Reorder
  mealSlots.value.forEach((s, i) => s.order = i)
  appStore.showSnackbar('Mahlzeit entfernt')
}

function moveSlot(index, direction) {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= mealSlots.value.length) return

  const temp = mealSlots.value[index]
  mealSlots.value[index] = mealSlots.value[newIndex]
  mealSlots.value[newIndex] = temp

  // Update order
  mealSlots.value.forEach((s, i) => s.order = i)
}
</script>

<template>
  <div class="settings-view">
    <h1 class="text-h5 font-weight-bold mb-4">Einstellungen</h1>

    <!-- User Settings -->
    <v-card variant="flat" color="surface" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-account" class="mr-2" />
        Benutzername
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="deviceUserName"
          label="Name"
          hint="Wird für Benachrichtigungen an andere Nutzer verwendet"
          persistent-hint
          placeholder="z.B. Max"
        />
      </v-card-text>
    </v-card>

    <!-- Advanced Settings -->
    <v-card variant="flat" color="surface" class="mb-4">
      <v-card-title class="d-flex align-center" style="cursor: pointer" @click="showAdvancedSettings = !showAdvancedSettings">
        <v-icon icon="mdi-cog-outline" class="mr-2" />
        Erweiterte Einstellungen
        <v-spacer />
        <v-icon :icon="showAdvancedSettings ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
      </v-card-title>

      <v-expand-transition>
        <v-card-text v-show="showAdvancedSettings">
          <!-- Defaults -->
          <div class="text-subtitle-2 mb-3">Standardwerte</div>
          <v-row class="mb-6">
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="defaultServings"
                label="Standard-Portionen"
                type="number"
                inputmode="numeric"
                min="1"
                max="20"
                hint="Wird für neue Gerichte verwendet"
                persistent-hint
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="defaultFreshnessDays"
                label="Standard-Haltbarkeit (Tage)"
                type="number"
                inputmode="numeric"
                min="1"
                hint="Wird für neue Produkte verwendet"
                persistent-hint
              />
            </v-col>
          </v-row>

          <v-divider class="mb-4" />

          <!-- Meal Slots -->
          <div class="text-subtitle-2 mb-3">Mahlzeiten pro Tag</div>
          <p class="text-body-2 text-medium-emphasis mb-4">
            Definiere die Mahlzeiten, die du täglich planen möchtest.
            Die Reihenfolge bestimmt die Anzeige im Planer.
          </p>

          <v-list density="compact">
            <v-list-item
              v-for="(slot, index) in mealSlots"
              :key="slot.id"
            >
              <template #prepend>
                <div class="d-flex flex-column mr-2">
                  <v-btn
                    icon="mdi-chevron-up"
                    variant="text"
                    size="x-small"
                    :disabled="index === 0"
                    @click="moveSlot(index, -1)"
                  />
                  <v-btn
                    icon="mdi-chevron-down"
                    variant="text"
                    size="x-small"
                    :disabled="index === mealSlots.length - 1"
                    @click="moveSlot(index, 1)"
                  />
                </div>
              </template>

              <v-list-item-title>{{ slot.name }}</v-list-item-title>

              <template #append>
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  size="small"
                  color="error"
                  @click="removeMealSlot(slot)"
                />
              </template>
            </v-list-item>
          </v-list>

          <v-btn
            variant="tonal"
            color="primary"
            class="mt-2"
            @click="showAddSlotDialog = true"
          >
            <v-icon start icon="mdi-plus" />
            Mahlzeit hinzufügen
          </v-btn>
        </v-card-text>
      </v-expand-transition>
    </v-card>

    <!-- About -->
    <v-card variant="flat" color="surface" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-information-outline" class="mr-2" />
        Über Schompf
      </v-card-title>
      <v-card-text>
        <p class="text-body-2 mb-2">
          <strong>Version:</strong> 1.0.0 (MVP)
        </p>
        <p class="text-body-2 mb-2">
          <strong>Build:</strong> {{ buildTime }}
        </p>
        <p class="text-body-2 text-medium-emphasis">
          Schompf hilft dir bei der Mahlzeitenplanung und erstellt automatisch
          Einkaufslisten aus deinen geplanten Gerichten.
        </p>
      </v-card-text>
    </v-card>

    <!-- Add Slot Dialog -->
    <v-dialog v-model="showAddSlotDialog" max-width="400">
      <v-card>
        <v-card-title>Mahlzeit hinzufügen</v-card-title>
        <v-card-text>
          <v-combobox
            v-model="newSlotName"
            :items="customSlotNames"
            label="Name"
            autofocus
            hint="Wähle einen Vorschlag oder gib einen eigenen Namen ein"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showAddSlotDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="addMealSlot" :disabled="!newSlotName">
            Hinzufügen
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
</style>
