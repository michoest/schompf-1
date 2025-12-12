<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDishesStore, useAppStore } from '@/stores'

const router = useRouter()
const dishesStore = useDishesStore()
const appStore = useAppStore()

const search = ref('')
const showNewDishDialog = ref(false)
const newDishName = ref('')

// Computed
const filteredDishes = computed(() => {
  if (!search.value) return dishesStore.dishes
  
  const searchLower = search.value.toLowerCase()
  return dishesStore.dishes.filter(d => 
    d.name.toLowerCase().includes(searchLower)
  )
})

const dishCount = computed(() => dishesStore.dishes.length)

// Actions
function editDish(dish) {
  router.push(`/gerichte/${dish.id}`)
}

async function createDish() {
  if (!newDishName.value.trim()) return
  
  try {
    const dish = await dishesStore.createDish({
      name: newDishName.value.trim(),
      type: 'dish',
      ingredients: [],
      defaultServings: 2
    })
    showNewDishDialog.value = false
    newDishName.value = ''
    appStore.showSnackbar('Gericht erstellt')
    router.push(`/gerichte/${dish.id}`)
  } catch (error) {
    appStore.showSnackbar('Fehler beim Erstellen', 'error')
  }
}

async function deleteDish(dish) {
  if (!confirm(`"${dish.name}" wirklich löschen?`)) return
  
  try {
    await dishesStore.deleteDish(dish.id)
    appStore.showSnackbar('Gericht gelöscht')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Löschen', 'error')
  }
}

onMounted(() => {
  dishesStore.fetchDishes()
})
</script>

<template>
  <div class="dishes-view">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-2">
      <div>
        <h1 class="text-h5 font-weight-bold">Gerichte</h1>
        <p class="text-body-2 text-medium-emphasis">{{ dishCount }} Gerichte</p>
      </div>
      
      <v-btn
        color="primary"
        @click="showNewDishDialog = true"
      >
        <v-icon start icon="mdi-plus" />
        Neues Gericht
      </v-btn>
    </div>

    <!-- Search -->
    <v-text-field
      v-model="search"
      prepend-inner-icon="mdi-magnify"
      label="Gerichte suchen..."
      clearable
      hide-details
      class="mb-4"
    />

    <!-- Dishes list -->
    <v-card variant="flat" color="surface">
      <v-list v-if="filteredDishes.length > 0">
        <v-list-item
          v-for="dish in filteredDishes"
          :key="dish.id"
          :title="dish.name"
          :subtitle="`${dish.defaultServings} Portionen · ${dish.ingredients?.length || 0} Zutaten`"
          @click="editDish(dish)"
        >
          <template #prepend>
            <v-avatar color="primary" variant="tonal">
              <v-icon 
                :icon="dish.type === 'eating_out' ? 'mdi-food-takeout-box' : 'mdi-food'"
              />
            </v-avatar>
          </template>

          <template #append>
            <v-btn
              icon="mdi-open-in-new"
              variant="text"
              size="small"
              :href="dish.recipeUrl"
              target="_blank"
              @click.stop
              v-if="dish.recipeUrl"
            />
            <v-btn
              icon="mdi-delete-outline"
              variant="text"
              size="small"
              color="error"
              @click.stop="deleteDish(dish)"
            />
            <v-icon icon="mdi-chevron-right" />
          </template>
        </v-list-item>
      </v-list>

      <v-card-text v-else class="text-center pa-8">
        <v-icon icon="mdi-food-off" size="64" color="primary" class="mb-4" />
        <div class="text-h6 mb-2">Keine Gerichte gefunden</div>
        <div class="text-body-2 text-medium-emphasis">
          {{ search ? 'Versuche einen anderen Suchbegriff' : 'Erstelle dein erstes Gericht' }}
        </div>
      </v-card-text>
    </v-card>

    <!-- New dish dialog -->
    <v-dialog v-model="showNewDishDialog" max-width="400">
      <v-card>
        <v-card-title>Neues Gericht</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newDishName"
            label="Name"
            autofocus
            @keyup.enter="createDish"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showNewDishDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="createDish" :disabled="!newDishName.trim()">
            Erstellen
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
</style>
