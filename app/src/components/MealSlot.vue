<script setup>
import { computed } from 'vue'

const props = defineProps({
  meals: {
    type: Array,
    default: () => []
  },
  date: String,
  slotId: String,
  slotName: String
})

const emit = defineEmits(['add', 'edit', 'delete'])

const hasMeals = computed(() => props.meals.length > 0)
</script>

<template>
  <div class="meal-slot">
    <!-- Existing meals -->
    <div
      v-for="meal in meals"
      :key="meal.id"
      class="meal-item"
      :class="{ 'meal-committed': meal.committed }"
      @click="emit('edit', meal)"
    >
      <div class="meal-content">
        <div class="d-flex align-center gap-1">
          <span class="meal-name">{{ meal.dishName || 'Leer' }}</span>
          <v-icon
            v-if="meal.committed"
            icon="mdi-cart-check"
            size="x-small"
            class="committed-icon"
          />
        </div>
        <span v-if="meal.servings" class="meal-servings">
          {{ meal.servings }} Portionen
        </span>
      </div>

      <v-btn
        icon="mdi-close"
        size="x-small"
        variant="text"
        density="compact"
        class="delete-btn"
        @click.stop="emit('delete', meal)"
      />
    </div>

    <!-- Add button (only if no meals) -->
    <v-btn
      v-if="!hasMeals"
      variant="text"
      size="small"
      color="primary"
      class="add-btn"
      @click="emit('add')"
    >
      <v-icon icon="mdi-plus" size="small" />
    </v-btn>
    
    <!-- Add more button (if has meals) -->
    <v-btn
      v-else
      variant="text"
      size="x-small"
      color="primary"
      density="compact"
      class="add-more-btn"
      @click="emit('add')"
    >
      <v-icon icon="mdi-plus" size="x-small" />
    </v-btn>
  </div>
</template>

<style scoped>
.meal-slot {
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: 100%;
  min-height: 52px;
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

.committed-icon {
  color: rgb(var(--v-theme-success));
  flex-shrink: 0;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgb(var(--v-theme-primary));
}

.meal-servings {
  font-size: 0.65rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.delete-btn {
  opacity: 0.6;
  transition: opacity 0.15s;
}

.meal-item:hover .delete-btn {
  opacity: 1;
}

.add-btn {
  flex: 1;
  min-height: 44px;
}

.add-more-btn {
  align-self: center;
  margin-top: 2px;
}
</style>
