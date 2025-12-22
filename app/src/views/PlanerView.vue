<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useMealsStore, useDishesStore, useAppStore, useShoppingStore } from '@/stores'
import MealSlot from '@/components/MealSlot.vue'
import DishSelector from '@/components/DishSelector.vue'
import api from '@/services/api'

const mealsStore = useMealsStore()
const dishesStore = useDishesStore()
const appStore = useAppStore()
const shoppingStore = useShoppingStore()

// Date range state (centered on today with 3 days before and after)
const today = new Date()
today.setHours(0, 0, 0, 0)
const initialStart = new Date(today)
initialStart.setDate(initialStart.getDate() - 3)
const initialEnd = new Date(today)
initialEnd.setDate(initialEnd.getDate() + 3)

const rangeStart = ref(initialStart)
const rangeEnd = ref(initialEnd)
const selectedMeal = ref(null)
const selectedDishHasRecipe = ref(false)
const showDishSelector = ref(false)
const showCreateListDialog = ref(false)
const showDeleteDialog = ref(false)
const showCommittedMealSheet = ref(false)
const showUncommittedMealSheet = ref(false)
const showEatingOutMealSheet = ref(false)
const showEditEatingOutDialog = ref(false)
const editingEatingOutDescription = ref('')
const showMoveMealDialog = ref(false)
const moveToDate = ref(null)
const moveToSlot = ref(null)
const mealToDelete = ref(null)
const listFromDate = ref(null)
const listToDate = ref(null)
const listShoppingDate = ref(null)

const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 600)
const editingMealId = computed(() => {
  if (showUncommittedMealSheet.value && selectedMeal.value && !selectedMeal.value.isNew) {
    return selectedMeal.value.id
  }
  return null
})

onMounted(() => {
  window.addEventListener('resize', () => {
    windowWidth.value = window.innerWidth
  })
  loadWeekData()

  // Scroll to today after data is loaded and DOM is updated
  setTimeout(() => {
    scrollToToday()
  }, 100)
})

function scrollToToday() {
  const todayElement = document.querySelector('.bg-primary.text-white')
  if (todayElement) {
    const navHeight = 64 + 80 // App bar + sticky nav height
    const elementTop = todayElement.getBoundingClientRect().top + window.scrollY
    window.scrollTo({
      top: elementTop - navHeight,
      behavior: 'smooth'
    })
  }
}

// Meal slots
const mealSlots = [
  { id: 'breakfast', name: 'Frühstück', icon: 'mdi-coffee' },
  { id: 'lunch', name: 'Mittagessen', icon: 'mdi-food' },
  { id: 'dinner', name: 'Abendessen', icon: 'mdi-food-variant' },
]

// Computed week days
// All days in current range
const allDays = computed(() => {
  const days = []
  const current = new Date(rangeStart.value)
  const end = new Date(rangeEnd.value)

  while (current <= end) {
    days.push({
      date: formatDate(current),
      dayName: getDayName(current),
      dayNameFull: getDayNameFull(current),
      dayNumber: current.getDate(),
      month: current.getMonth() + 1,
      isToday: isToday(current),
      isPast: isPast(current),
      isMonday: current.getDay() === 1,
      weekNumber: getWeekNumber(current)
    })
    current.setDate(current.getDate() + 1)
  }
  return days
})

// Group days by week for display
const weeks = computed(() => {
  const weekMap = new Map()

  for (const day of allDays.value) {
    const weekKey = `${day.date.substring(0, 4)}-W${day.weekNumber}`
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        weekNumber: day.weekNumber,
        days: []
      })
    }
    weekMap.get(weekKey).days.push(day)
  }

  return Array.from(weekMap.values())
})

const rangeDisplay = computed(() => {
  return `${formatDateDisplayFull(rangeStart.value)} – ${formatDateDisplayFull(rangeEnd.value)}`
})

const totalWeeks = computed(() => weeks.value.length)

const uncommittedMealsInRange = computed(() => {
  return mealsStore.meals.filter(m =>
    m.date >= formatDate(rangeStart.value) &&
    m.date <= formatDate(rangeEnd.value) &&
    m.dishId && // Only meals with dishes
    (!m.status || m.status === 'planned')
  )
})

const uncommittedCount = computed(() => uncommittedMealsInRange.value.length)

// Get date range of uncommitted meals for prefilling
const uncommittedDateRange = computed(() => {
  if (uncommittedMealsInRange.value.length === 0) {
    return { from: null, to: null }
  }
  const dates = uncommittedMealsInRange.value.map(m => m.date).sort()
  return {
    from: dates[0],
    to: dates[dates.length - 1]
  }
})

const mealsInSelectedRange = computed(() => {
  if (!listFromDate.value || !listToDate.value) return []
  return uncommittedMealsInRange.value.filter(m =>
    m.date >= listFromDate.value && m.date <= listToDate.value
  )
})

// Helper functions
function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getEndOfWeek(monday) {
  const end = new Date(monday)
  end.setDate(monday.getDate() + 6)
  return end
}

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

function formatDateDisplay(date) {
  const d = new Date(date)
  return `${d.getDate()}.${d.getMonth() + 1}.`
}

function formatDateDisplayFull(date) {
  const d = new Date(date)
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
}

function getDayName(date) {
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  return days[date.getDay()]
}

function getDayNameFull(date) {
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  return days[date.getDay()]
}

function isToday(date) {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

function isPast(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date < today
}

function getWeekNumber(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

// Navigation
// Navigation
function previousWeek() {
  const newStart = new Date(rangeStart.value)
  newStart.setDate(newStart.getDate() - 7)
  const newEnd = new Date(rangeEnd.value)
  newEnd.setDate(newEnd.getDate() - 7)
  rangeStart.value = newStart
  rangeEnd.value = newEnd
}

function nextWeek() {
  const newStart = new Date(rangeStart.value)
  newStart.setDate(newStart.getDate() + 7)
  const newEnd = new Date(rangeEnd.value)
  newEnd.setDate(newEnd.getDate() + 7)
  rangeStart.value = newStart
  rangeEnd.value = newEnd
}

function loadWeekBefore() {
  const newStart = new Date(rangeStart.value)
  newStart.setDate(newStart.getDate() - 7)
  rangeStart.value = newStart
}

function loadWeekAfter() {
  const newEnd = new Date(rangeEnd.value)
  newEnd.setDate(newEnd.getDate() + 7)
  rangeEnd.value = newEnd
}

function goToToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Show 3 days before and 3 days after today (7 days total)
  const start = new Date(today)
  start.setDate(start.getDate() - 3)
  const end = new Date(today)
  end.setDate(end.getDate() + 3)

  rangeStart.value = start
  rangeEnd.value = end
}

// Meal actions
function getMealsForDaySlot(date, slotId) {
  return mealsStore.getMealsForDate(date).filter(m => m.slotId === slotId)
}

function openDishSelector(date, slotId, slotName) {
  selectedMeal.value = { date, slotId, slotName, isNew: true }
  showDishSelector.value = true
}

async function editMeal(meal) {
  selectedMeal.value = { ...meal, isNew: false }

  // Check if this is an "eating out" meal (no dishId but has dishName)
  const isEatingOut = !meal.dishId && meal.dishName

  if (isEatingOut) {
    // Show special sheet for eating out meals
    showEatingOutMealSheet.value = true
  } else if (meal.status === 'committed' || meal.status === 'prepared') {
    // Check if dish has a recipe URL
    selectedDishHasRecipe.value = false
    if (meal.dishId) {
      try {
        const dish = await dishesStore.fetchDish(meal.dishId)
        selectedDishHasRecipe.value = !!(dish?.recipeUrl)
      } catch (error) {
        // Ignore error, just leave as false
      }
    }
    showCommittedMealSheet.value = true
  } else {
    // For planned meals, check if dish has a recipe URL
    selectedDishHasRecipe.value = false
    if (meal.dishId) {
      try {
        const dish = await dishesStore.fetchDish(meal.dishId)
        selectedDishHasRecipe.value = !!(dish?.recipeUrl)
      } catch (error) {
        // Ignore error, just leave as false
      }
    }
    showUncommittedMealSheet.value = true
  }
}

function editUncommittedMeal() {
  showUncommittedMealSheet.value = false
  showDishSelector.value = true
}

function editCommittedMeal() {
  showCommittedMealSheet.value = false
  showDishSelector.value = true
}

function openMoveMealDialog() {
  // Don't allow moving prepared meals
  if (selectedMeal.value.status === 'prepared') {
    appStore.showSnackbar('Zubereitete Mahlzeiten können nicht verschoben werden', 'warning')
    return
  }
  showCommittedMealSheet.value = false
  showUncommittedMealSheet.value = false
  moveToDate.value = selectedMeal.value.date
  moveToSlot.value = selectedMeal.value.slotId
  showMoveMealDialog.value = true
}

async function confirmMoveMeal() {
  try {
    await mealsStore.updateMeal(selectedMeal.value.id, {
      date: moveToDate.value,
      slotId: moveToSlot.value,
      slotName: mealSlots.find(s => s.id === moveToSlot.value)?.name
    })
    showMoveMealDialog.value = false
    appStore.showSnackbar('Mahlzeit verschoben')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Verschieben der Mahlzeit', 'error')
  }
}

async function showRecipe() {
  if (!selectedMeal.value?.dishId) {
    appStore.showSnackbar('Kein Rezept verfügbar', 'warning')
    return
  }

  try {
    const dish = await dishesStore.fetchDish(selectedMeal.value.dishId)
    if (dish?.recipeUrl) {
      // Use location.href for better PWA compatibility
      window.location.href = dish.recipeUrl
      showCommittedMealSheet.value = false
      showUncommittedMealSheet.value = false
    } else {
      appStore.showSnackbar('Kein Rezept-Link hinterlegt', 'warning')
    }
  } catch (error) {
    appStore.showSnackbar('Fehler beim Laden des Rezepts', 'error')
  }
}

async function onDishSelected({ dish, servings }) {
  try {
    if (selectedMeal.value.isNew) {
      await mealsStore.createMeal({
        date: selectedMeal.value.date,
        slotId: selectedMeal.value.slotId,
        slotName: selectedMeal.value.slotName,
        dishId: dish?.id || null,
        dishName: dish?.type === 'eating_out' ? dish.name : undefined,
        servings: servings || 2
      })
      appStore.showSnackbar('Mahlzeit hinzugefügt')
    } else {
      await mealsStore.updateMeal(selectedMeal.value.id, {
        dishId: dish?.id || null,
        dishName: dish?.type === 'eating_out' ? dish.name : undefined,
        servings: servings || selectedMeal.value.servings
      })
      appStore.showSnackbar('Mahlzeit aktualisiert')
    }
  } catch (error) {
    appStore.showSnackbar('Fehler beim Speichern der Mahlzeit', 'error')
  }
  showDishSelector.value = false
}

function cancelEdit() {
  showUncommittedMealSheet.value = false
  selectedMeal.value = null
}

function openEditEatingOutDialog() {
  editingEatingOutDescription.value = selectedMeal.value.dishName
  showEatingOutMealSheet.value = false
  showEditEatingOutDialog.value = true
}

async function saveEatingOutDescription() {
  try {
    await mealsStore.updateMeal(selectedMeal.value.id, {
      dishName: editingEatingOutDescription.value
    })
    showEditEatingOutDialog.value = false
    editingEatingOutDescription.value = ''
    appStore.showSnackbar('Beschreibung aktualisiert')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Speichern der Beschreibung', 'error')
  }
}

function deleteEatingOutMeal() {
  showEatingOutMealSheet.value = false
  mealToDelete.value = selectedMeal.value
  confirmDelete()
}

function deleteMeal(meal) {
  // Show warning for committed meals
  if (meal.status === 'committed' || meal.status === 'prepared') {
    mealToDelete.value = meal
    showDeleteDialog.value = true
  } else {
    // Delete immediately for planned meals
    mealToDelete.value = meal
    confirmDelete()
  }
}

async function markMealPrepared() {
  try {
    const updatedMeal = await api.markMealPrepared(selectedMeal.value.id)
    // Update meal in store
    const index = mealsStore.meals.findIndex(m => m.id === selectedMeal.value.id)
    if (index !== -1) {
      mealsStore.meals[index] = updatedMeal
    }
    showCommittedMealSheet.value = false
    appStore.showSnackbar('Mahlzeit als zubereitet markiert')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Markieren der Mahlzeit', 'error')
  }
}

async function resetMealToCommitted() {
  try {
    const updatedMeal = await api.resetMealToCommitted(selectedMeal.value.id)
    // Update meal in store
    const index = mealsStore.meals.findIndex(m => m.id === selectedMeal.value.id)
    if (index !== -1) {
      mealsStore.meals[index] = updatedMeal
    }
    showCommittedMealSheet.value = false
    appStore.showSnackbar('Mahlzeit zurückgesetzt')
  } catch (error) {
    appStore.showSnackbar('Fehler beim Zurücksetzen der Mahlzeit', 'error')
  }
}

async function confirmDelete() {
  try {
    if (!mealToDelete.value) return

    await mealsStore.deleteMeal(mealToDelete.value.id)
    appStore.showSnackbar('Mahlzeit gelöscht')
    showDeleteDialog.value = false
    mealToDelete.value = null
  } catch (error) {
    appStore.showSnackbar('Fehler beim Löschen der Mahlzeit', 'error')
  }
}

// Load data when week changes
async function loadWeekData() {
  const from = formatDate(rangeStart.value)
  const to = formatDate(rangeEnd.value)
  await Promise.all([
    mealsStore.fetchMeals(from, to),
    dishesStore.fetchDishes()
  ])
}

function openCreateListDialog() {
  // Prefill with date range of uncommitted meals
  listFromDate.value = uncommittedDateRange.value.from
  listToDate.value = uncommittedDateRange.value.to
  listShoppingDate.value = formatDate(new Date()) // Default to today
  showCreateListDialog.value = true
}

async function createShoppingList() {
  try {
    if (!listFromDate.value || !listToDate.value) {
      appStore.showSnackbar('Bitte wähle einen Zeitraum', 'warning')
      return
    }

    if (!listShoppingDate.value) {
      appStore.showSnackbar('Bitte wähle ein Einkaufsdatum', 'warning')
      return
    }

    if (mealsInSelectedRange.value.length === 0) {
      appStore.showSnackbar('Keine Mahlzeiten im gewählten Zeitraum', 'warning')
      return
    }

    // Generate the shopping list (will merge with existing)
    await shoppingStore.generateList(listFromDate.value, listToDate.value, listShoppingDate.value)

    // Commit the meals that were included in the list
    if (shoppingStore.shoppingList?.mealIds?.length > 0) {
      await mealsStore.commitMeals(shoppingStore.shoppingList.mealIds)
      appStore.showSnackbar(`${shoppingStore.shoppingList.mealIds.length} Mahlzeiten zur Einkaufsliste hinzugefügt`)
    }

    showCreateListDialog.value = false
  } catch (error) {
    appStore.showSnackbar('Fehler beim Erstellen der Einkaufsliste', 'error')
  }
}

watch([rangeStart, rangeEnd], loadWeekData)

onMounted(() => {
  window.addEventListener('resize', () => {
    windowWidth.value = window.innerWidth
  })
  loadWeekData()
})
</script>

<template>
  <div class="planer-view">
    <!-- Sticky Navigation Header -->
    <v-card class="mb-4 sticky-nav" variant="flat" color="surface">
      <v-card-text class="pa-3">
        <!-- Top row: Range display and quick actions -->
        <div class="d-flex align-center justify-center mb-2">
          <span class="text-body-2 font-weight-medium">{{ rangeDisplay }}</span>
        </div>

        <!-- Bottom row: Week navigation -->
        <div class="d-flex align-center justify-space-between">
          <v-btn variant="text" size="small" @click="previousWeek">
            <v-icon start icon="mdi-chevron-left" />
            Vorherige
          </v-btn>

          <div class="d-flex gap-2 align-center">
            <v-btn variant="tonal" color="primary" size="small" @click="goToToday">
              Heute
            </v-btn>
          </div>

          <v-btn variant="text" size="small" @click="nextWeek">
            Nächste
            <v-icon end icon="mdi-chevron-right" />
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Load More Top Button -->
    <v-card class="mb-4" variant="flat" color="surface">
      <v-card-text class="pa-2">
        <v-btn
          block
          variant="tonal"
          color="primary"
          @click="loadWeekBefore"
        >
          <v-icon start icon="mdi-chevron-up" />
          Frühere Tage anzeigen
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- Mobile: Vertical list view -->
    <div v-if="isMobile" class="mobile-planer">
      <template v-for="week in weeks" :key="week.weekNumber">
        <!-- Week header -->
        <div class="week-divider d-flex align-center my-2">
          <v-divider class="flex-grow-1" />
          <v-chip size="small" variant="outlined" class="mx-2" style="min-width: 60px;">
            KW {{ week.weekNumber }}
          </v-chip>
          <v-divider class="flex-grow-1" />
        </div>

        <v-card v-for="day in week.days" :key="day.date" class="mb-3" variant="flat" color="surface">
          <v-card-title class="d-flex align-center py-2 px-3" :class="{ 'bg-primary text-white': day.isToday }">
            <span class="text-body-1 font-weight-bold">{{ day.dayNameFull }}</span>
            <span class="text-body-1 ml-2">{{ day.dayNumber }}.{{ day.month }}.</span>
            <v-chip v-if="day.isToday" size="x-small" color="white" variant="outlined" class="ml-2">
              Heute
            </v-chip>
          </v-card-title>

          <v-divider />

          <v-card-text class="pa-2">
            <div v-for="slot in mealSlots" :key="`${day.date}-${slot.id}`"
              class="mobile-meal-row d-flex align-center py-2">
              <div class="slot-label-mobile text-caption text-medium-emphasis d-flex align-center" style="min-width: 110px; flex-shrink: 0;">
                <v-icon :icon="slot.icon" size="small" class="mr-1" />
                <span style="white-space: nowrap;">{{ slot.name }}</span>
              </div>
              <div class="flex-grow-1">
                <MealSlot :meals="getMealsForDaySlot(day.date, slot.id)" :date="day.date" :slot-id="slot.id"
                  :slot-name="slot.name" :editing-meal-id="editingMealId" @add="openDishSelector(day.date, slot.id, slot.name)" @edit="editMeal"
                  @delete="deleteMeal" @cancel-edit="cancelEdit" />
              </div>
            </div>
          </v-card-text>
        </v-card>
      </template>
    </div>

    <!-- Desktop: Grid view -->
    <div v-else class="desktop-planer">
      <template v-for="week in weeks" :key="week.weekNumber">
        <!-- Week header -->
        <div class="week-divider d-flex align-center my-3">
          <v-divider class="flex-grow-1" />
          <v-chip size="small" variant="tonal" color="primary" class="mx-3">
            Kalenderwoche {{ week.weekNumber }}
          </v-chip>
          <v-divider class="flex-grow-1" />
        </div>

        <div class="week-grid-wrapper">
          <div class="week-grid">
            <!-- Day Headers -->
            <div class="day-header empty-cell"></div>
            <div v-for="day in week.days" :key="day.date" class="day-header"
              :class="{ 'today': day.isToday, 'past': day.isPast }">
              <span class="day-name">{{ day.dayName }}</span>
              <span class="day-number">{{ day.dayNumber }}.{{ day.month }}.</span>
            </div>
            <!-- Fill remaining cells if week is incomplete -->
            <div v-for="n in (7 - week.days.length)" :key="'empty-header-' + n" class="day-header empty-day" />

            <!-- Meal Rows -->
            <template v-for="slot in mealSlots" :key="slot.id">
              <div class="slot-label">
                <v-icon :icon="slot.icon" size="small" class="mr-1" style="flex-shrink: 0;" />
                <span style="white-space: nowrap;">{{ slot.name }}</span>
              </div>

              <div v-for="day in week.days" :key="`${day.date}-${slot.id}`" class="meal-cell"
                :class="{ 'past': day.isPast }">
                <MealSlot :meals="getMealsForDaySlot(day.date, slot.id)" :date="day.date" :slot-id="slot.id"
                  :slot-name="slot.name" :editing-meal-id="editingMealId" @add="openDishSelector(day.date, slot.id, slot.name)" @edit="editMeal"
                  @delete="deleteMeal" @cancel-edit="cancelEdit" />
              </div>
              <!-- Fill remaining cells if week is incomplete -->
              <div v-for="n in (7 - week.days.length)" :key="'empty-cell-' + slot.id + '-' + n"
                class="meal-cell empty-day" />
            </template>
          </div>
        </div>
      </template>
    </div>

    <!-- Load More Bottom Button -->
    <v-card class="mt-4" variant="flat" color="surface">
      <v-card-text class="pa-2">
        <v-btn
          block
          variant="tonal"
          color="primary"
          @click="loadWeekAfter"
        >
          <v-icon start icon="mdi-chevron-down" />
          Spätere Tage anzeigen
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- Dish Selector Dialog -->
    <DishSelector
      v-model="showDishSelector"
      :dishes="dishesStore.dishes"
      :initial-dish="selectedMeal?.dishId ? dishesStore.dishes.find(d => d.id === selectedMeal.dishId) : null"
      :initial-servings="selectedMeal?.servings"
      :show-cancel="!selectedMeal?.isNew"
      @select="onDishSelected"
      @cancel="cancelEdit"
    />

    <!-- Create Shopping List Dialog -->
    <v-dialog v-model="showCreateListDialog" max-width="500">
      <v-card>
        <v-card-title>Einkaufsliste erstellen</v-card-title>
        <v-card-text>
          <p class="mb-3">
            Wähle den Zeitraum für die Einkaufsliste:
          </p>
          <v-text-field
            v-model="listFromDate"
            label="Von"
            type="date"
            class="mb-3"
          />
          <v-text-field
            v-model="listToDate"
            label="Bis"
            type="date"
            class="mb-3"
          />
          <v-text-field
            v-model="listShoppingDate"
            label="Einkaufsdatum"
            type="date"
            class="mb-3"
            hint="Wann möchtest du einkaufen gehen?"
            persistent-hint
          />
          <v-alert v-if="mealsInSelectedRange.length > 0" type="success" variant="tonal" density="compact" class="mb-3">
            <strong>{{ mealsInSelectedRange.length }} Mahlzeit(en)</strong> werden hinzugefügt
          </v-alert>
          <v-alert v-else-if="listFromDate && listToDate" type="warning" variant="tonal" density="compact" class="mb-3">
            Keine Mahlzeiten im gewählten Zeitraum
          </v-alert>
          <v-alert type="info" variant="tonal" density="compact">
            Die ausgewählten Mahlzeiten werden als "zur Einkaufsliste hinzugefügt" markiert. Bereits vorhandene Artikel in der Liste bleiben erhalten.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCreateListDialog = false">Abbrechen</v-btn>
          <v-btn color="success" :disabled="mealsInSelectedRange.length === 0" @click="createShoppingList">
            <v-icon start icon="mdi-cart-plus" />
            Hinzufügen
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Committed Meal Warning Dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="500">
      <v-card>
        <v-card-title>Mahlzeit löschen?</v-card-title>
        <v-card-text>
          <p class="mb-3">
            <strong>{{ mealToDelete?.dishName }}</strong> wurde bereits zur Einkaufsliste hinzugefügt.
          </p>
          <v-alert type="warning" variant="tonal" density="compact">
            Die Zutaten bleiben auf der Einkaufsliste, auch wenn du diese Mahlzeit löschst.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDeleteDialog = false">Abbrechen</v-btn>
          <v-btn color="error" @click="confirmDelete">
            Trotzdem löschen
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Eating out meal bottom sheet -->
    <v-bottom-sheet v-model="showEatingOutMealSheet" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center pa-4">
          <v-icon icon="mdi-food-takeout-box" class="mr-2" />
          {{ selectedMeal?.dishName || 'Auswärts essen' }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showEatingOutMealSheet = false" />
        </v-card-title>

        <v-card-text class="pa-2">
          <v-list density="compact">
            <v-list-item @click="openEditEatingOutDialog" prepend-icon="mdi-pencil">
              <v-list-item-title>Beschreibung ändern</v-list-item-title>
            </v-list-item>

            <v-divider class="my-2" />

            <v-list-item @click="deleteEatingOutMeal" prepend-icon="mdi-delete" class="text-error">
              <v-list-item-title>Mahlzeit löschen</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-bottom-sheet>

    <!-- Edit eating out description dialog -->
    <v-dialog v-model="showEditEatingOutDialog" max-width="400">
      <v-card>
        <v-card-title>Beschreibung ändern</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="editingEatingOutDescription"
            label="Beschreibung"
            autofocus
            @keyup.enter="saveEatingOutDescription"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showEditEatingOutDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="saveEatingOutDescription">Speichern</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Uncommitted meal bottom sheet -->
    <v-bottom-sheet v-model="showUncommittedMealSheet" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center pa-4">
          <div class="flex-grow-1">
            <div class="d-flex align-center">
              <v-icon :icon="selectedMeal?.dishId ? 'mdi-food' : 'mdi-silverware-fork-knife'" class="mr-2" />
              {{ selectedMeal?.dishName || 'Leer' }}
            </div>
            <div v-if="selectedMeal?.servings" class="text-caption text-medium-emphasis ml-8">
              {{ selectedMeal.servings }} Portionen
            </div>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="showUncommittedMealSheet = false" />
        </v-card-title>

        <v-card-text class="pa-2">
          <v-list density="compact">
            <v-list-item @click="openMoveMealDialog" prepend-icon="mdi-arrow-all">
              <v-list-item-title>Mahlzeit verschieben</v-list-item-title>
              <v-list-item-subtitle>Datum oder Slot ändern</v-list-item-subtitle>
            </v-list-item>

            <v-list-item @click="editUncommittedMeal" prepend-icon="mdi-pencil">
              <v-list-item-title>Mahlzeit bearbeiten</v-list-item-title>
              <v-list-item-subtitle>Gericht oder Portionen ändern</v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="selectedMeal?.dishId" @click="showRecipe" prepend-icon="mdi-book-open-variant"
              :disabled="!selectedDishHasRecipe">
              <v-list-item-title>Rezept anzeigen</v-list-item-title>
              <v-list-item-subtitle>
                {{ selectedDishHasRecipe ? 'Zutaten und Zubereitung' : 'Kein Rezept-Link hinterlegt' }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-divider class="my-2" />

            <v-list-item @click="deleteMeal(selectedMeal); showUncommittedMealSheet = false" prepend-icon="mdi-delete"
              class="text-error">
              <v-list-item-title>Mahlzeit löschen</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-bottom-sheet>

    <!-- Committed meal bottom sheet -->
    <v-bottom-sheet v-model="showCommittedMealSheet" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center pa-4">
          <v-icon :icon="selectedMeal?.dishId ? 'mdi-food' : 'mdi-silverware-fork-knife'" class="mr-2" />
          {{ selectedMeal?.dishName || 'Leer' }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showCommittedMealSheet = false" />
        </v-card-title>

        <v-card-text class="pa-2">
          <v-list density="compact">
            <v-list-item @click="openMoveMealDialog" prepend-icon="mdi-arrow-all">
              <v-list-item-title>Mahlzeit verschieben</v-list-item-title>
              <v-list-item-subtitle>Datum oder Slot ändern</v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="selectedMeal?.dishId" @click="showRecipe" prepend-icon="mdi-book-open-variant"
              :disabled="!selectedDishHasRecipe">
              <v-list-item-title>Rezept anzeigen</v-list-item-title>
              <v-list-item-subtitle>
                {{ selectedDishHasRecipe ? 'Zutaten und Zubereitung' : 'Kein Rezept-Link hinterlegt' }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-divider class="my-2" />

            <v-list-item v-if="selectedMeal?.status === 'committed'" @click="markMealPrepared" prepend-icon="mdi-check-all">
              <v-list-item-title>Als zubereitet markieren</v-list-item-title>
              <v-list-item-subtitle>Mahlzeit wurde gekocht</v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="selectedMeal?.status === 'prepared'" @click="resetMealToCommitted" prepend-icon="mdi-undo-variant">
              <v-list-item-title>Zurücksetzen</v-list-item-title>
              <v-list-item-subtitle>Status auf 'committet' zurücksetzen</v-list-item-subtitle>
            </v-list-item>

            <v-divider v-if="selectedMeal?.status === 'committed' || selectedMeal?.status === 'prepared'" class="my-2" />

            <v-list-item @click="deleteMeal(selectedMeal); showCommittedMealSheet = false" prepend-icon="mdi-delete"
              class="text-error">
              <v-list-item-title>Mahlzeit löschen</v-list-item-title>
              <v-list-item-subtitle>Aus Einkaufsliste entfernen</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-bottom-sheet>

    <!-- Move meal dialog -->
    <v-dialog v-model="showMoveMealDialog" max-width="400">
      <v-card>
        <v-card-title>Mahlzeit verschieben</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="moveToDate"
            label="Datum"
            type="date"
            class="mb-3"
          />
          <v-select
            v-model="moveToSlot"
            :items="mealSlots"
            item-title="name"
            item-value="id"
            label="Slot"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showMoveMealDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="confirmMoveMeal">Verschieben</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- FAB for creating shopping list -->
    <v-btn
      v-if="uncommittedCount > 0"
      color="success"
      icon="mdi-cart-plus"
      size="large"
      position="fixed"
      location="bottom end"
      class="mb-16 mr-4"
      elevation="4"
      @click="openCreateListDialog"
    >
      <v-badge
        :content="uncommittedCount"
        color="error"
        overlap
        offset-x="-12"
        offset-y="-12"
      >
        <v-icon>mdi-cart-plus</v-icon>
      </v-badge>
    </v-btn>
  </div>
</template>

<style scoped>
/* Sticky navigation */
.sticky-nav {
  position: sticky;
  top: calc(64px + env(safe-area-inset-top));
  z-index: 10;
}

/* Desktop Grid */
.week-grid-wrapper {
  overflow-x: auto;
}

.week-grid {
  display: grid;
  grid-template-columns: 100px repeat(7, minmax(100px, 1fr));
  gap: 4px;
  min-width: 600px;
}

.day-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  background: rgb(var(--v-theme-surface));
  border-radius: 8px;
}

.day-header.today {
  background: rgb(var(--v-theme-primary));
  color: white;
}

.day-header.past {
  opacity: 0.5;
}

.day-header.empty-day {
  background: transparent;
  opacity: 0.3;
}

.day-name {
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.day-number {
  font-size: 1rem;
  font-weight: 600;
}

.empty-cell {
  background: transparent;
}

.slot-label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.7;
}

.meal-cell {
  min-height: 60px;
  background: rgb(var(--v-theme-surface));
  border-radius: 8px;
  padding: 4px;
}

.meal-cell.past {
  opacity: 0.6;
}

.meal-cell.empty-day {
  background: rgba(var(--v-theme-surface), 0.3);
}

/* Week divider */
.week-divider {
  opacity: 0.8;
}

/* Mobile List */
.mobile-planer .mobile-meal-row:not(:last-child) {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.mobile-planer .slot-label-mobile {
  flex-shrink: 0;
}

/* Tablet tweaks */
@media (min-width: 600px) and (max-width: 959px) {
  .week-grid {
    grid-template-columns: 80px repeat(7, minmax(80px, 1fr));
  }

  .slot-label {
    font-size: 0.7rem;
  }

  .day-number {
    font-size: 0.9rem;
  }
}

/* Mobile sticky nav adjustment */
@media (max-width: 599px) {
  .sticky-nav {
    top: 56px;
  }

  .sticky-nav .v-card-text {
    padding: 8px !important;
  }

  .sticky-nav .d-flex.gap-1 {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>