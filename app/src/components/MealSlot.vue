<script setup>
import { computed } from 'vue'

const props = defineProps({
  meals: {
    type: Array,
    default: () => []
  },
  date: String,
  slotId: String,
  slotName: String,
  editingMealId: String
})

const emit = defineEmits(['add', 'edit', 'delete', 'cancelEdit'])

const hasMeals = computed(() => props.meals.length > 0)
</script>

<template>
  <div class="meal-slot">
    <div class="meal-items-container" :class="{ 'has-meals': hasMeals }">
      <!-- Existing meals -->
      <div v-if="hasMeals" class="meals-list">
        <div
          v-for="meal in meals"
          :key="meal.id"
          class="meal-item"
          :class="{
            'meal-committed': meal.status === 'committed',
            'meal-prepared': meal.status === 'prepared',
            'meal-editing': editingMealId === meal.id
          }"
          @click="emit('edit', meal)"
        >
          <div class="meal-content">
            <div class="d-flex align-center gap-1">
              <span class="meal-name">{{ meal.dishName || 'Leer' }}</span>
              <v-icon
                v-if="meal.status === 'committed'"
                icon="mdi-cart-check"
                size="x-small"
                class="committed-icon"
              />
              <v-icon
                v-if="meal.status === 'prepared'"
                icon="mdi-check-all"
                size="x-small"
                class="prepared-icon"
              />
            </div>
            <span v-if="meal.servings && meal.dishId" class="meal-servings">
              {{ meal.servings }} Portionen
            </span>
          </div>

          <div class="meal-actions">
            <v-btn
              v-if="editingMealId === meal.id"
              icon="mdi-close-circle"
              size="x-small"
              variant="text"
              density="compact"
              class="cancel-btn"
              color="primary"
              @click.stop="emit('cancelEdit')"
            />
            <v-btn
              v-else
              icon="mdi-close"
              size="x-small"
              variant="text"
              density="compact"
              class="delete-btn"
              @click.stop="emit('delete', meal)"
            />
          </div>
        </div>
      </div>

      <!-- Add button -->
      <v-btn
        variant="text"
        size="small"
        color="primary"
        :class="hasMeals ? 'add-more-btn' : 'add-btn'"
        @click="emit('add')"
      >
        <v-icon icon="mdi-plus" size="small" />
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.meal-slot {
  display: flex;
  flex-direction: column;
  min-height: 52px;
}

.meal-items-container {
  display: flex;
  gap: 4px;
  align-items: center;
  min-height: 52px;
}

.meals-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  justify-content: center;
}

.meal-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  background: rgba(var(--v-theme-primary), 0.1);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.meal-item:hover {
  background: rgba(var(--v-theme-primary), 0.2);
}

.meal-item.meal-committed {
  background: rgba(var(--v-theme-success), 0.15);
  border-left: 2px solid rgb(var(--v-theme-success));
}

.meal-item.meal-committed:hover {
  background: rgba(var(--v-theme-success), 0.25);
}

.meal-item.meal-editing {
  background: rgba(var(--v-theme-primary), 0.25);
  border: 2px solid rgb(var(--v-theme-primary));
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.committed-icon {
  color: rgb(var(--v-theme-success));
  flex-shrink: 0;
}

.prepared-icon {
  color: rgb(var(--v-theme-success));
  flex-shrink: 0;
  opacity: 0.7;
}

.meal-item.meal-prepared {
  background: rgba(var(--v-theme-on-surface), 0.05);
  opacity: 0.6;
}

.meal-item.meal-prepared:hover {
  background: rgba(var(--v-theme-on-surface), 0.1);
  opacity: 0.7;
}

.meal-item.meal-prepared .meal-name {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.meal-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.meal-name {
  font-size: 0.75rem;
  font-weight: 500;
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
  color: rgb(var(--v-theme-primary));
  line-height: 1.2;
}

.meal-servings {
  font-size: 0.65rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.meal-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.delete-btn {
  opacity: 0.6;
  transition: opacity 0.15s;
}

.meal-item:hover .delete-btn {
  opacity: 1;
}

.cancel-btn {
  opacity: 1;
}

.add-btn {
  flex: 1;
  height: 100%;
  min-height: 52px;
  align-self: stretch;
}

.add-more-btn {
  align-self: center;
  flex-shrink: 0;
}
</style>
