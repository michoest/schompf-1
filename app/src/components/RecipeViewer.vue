<script setup>
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps({
  modelValue: Boolean,
  dish: Object,
  servings: Number,
  subDishes: {
    type: Array,
    default: () => []
  },
  allDishes: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const show = computed({
  get() {
    return props.modelValue
  },
  set(value) {
    emit('update:modelValue', value)
  }
})

const hasRecipe = computed(() => {
  return props.dish?.recipe && props.dish.recipe.trim().length > 0
})

const hasRecipeUrl = computed(() => {
  return props.dish?.recipeUrl && props.dish.recipeUrl.trim().length > 0
})

const hasIngredients = computed(() => {
  return props.dish?.ingredients && props.dish.ingredients.length > 0
})

// Get subdishes with full dish data
const subDishesWithData = computed(() => {
  if (!props.subDishes || props.subDishes.length === 0) return []

  return props.subDishes.map(subDish => {
    const dish = props.allDishes.find(d => d.id === subDish.dishId)
    return {
      ...subDish,
      dish: dish
    }
  }).filter(sd => sd.dish) // Only include subdishes where dish was found
})

const renderedRecipe = computed(() => {
  if (!hasRecipe.value) return ''

  // Replace ingredient placeholders before markdown parsing
  const processedRecipe = replaceIngredientPlaceholders(props.dish.recipe)
  return marked.parse(processedRecipe)
})

/**
 * Replace ingredient placeholders in recipe text with actual amounts
 * Syntax: {ingredient_name, factor}
 * Example: {Mehl, 0.5} → 200 g Mehl (if ingredient has 100g per serving and we need 4 servings)
 */
function replaceIngredientPlaceholders(text) {
  if (!hasIngredients.value) return text

  const servings = props.servings || props.dish.defaultServings || 1

  // Regex to match {ingredient_name, factor} or {ingredient_name,factor}
  // Allows optional whitespace around comma
  const placeholderRegex = /\{([^,}]+)\s*,\s*([0-9.]+)\}/g

  return text.replace(placeholderRegex, (match, ingredientName, factorStr) => {
    // Trim ingredient name and find matching ingredient (case-insensitive)
    const name = ingredientName.trim()
    const factor = parseFloat(factorStr)

    if (isNaN(factor)) {
      console.warn(`Invalid factor in ingredient placeholder: ${match}`)
      return match // Return original if factor is invalid
    }

    // Find ingredient by name (case-insensitive match)
    const ingredient = props.dish.ingredients.find(ing =>
      ing.productName.toLowerCase() === name.toLowerCase()
    )

    if (!ingredient) {
      console.warn(`Ingredient not found: ${name}`)
      return match // Return original if ingredient not found
    }

    if (!ingredient.amount) {
      // If ingredient has no amount, just return the name
      return ingredient.productName
    }

    // Calculate scaled amount: ingredient.amount (per serving) × servings × factor
    const scaledAmount = Math.round(ingredient.amount * servings * factor * 10) / 10

    // Format: "amount unit ingredient_name" (e.g., "200 g Mehl")
    return `${scaledAmount} ${ingredient.unit || ''} ${ingredient.productName}`.trim()
  })
}

// Scale ingredient amounts based on servings
const scaledIngredients = computed(() => {
  const servings = props.servings || props.dish?.defaultServings || 1
  const ingredients = []

  // Add main dish ingredients
  if (hasIngredients.value) {
    props.dish.ingredients.forEach(ing => {
      ingredients.push({
        ...ing,
        scaledAmount: ing.amount ? Math.round(ing.amount * servings * 10) / 10 : null,
        sourceDish: null // null indicates main dish
      })
    })
  }

  // Add subdish ingredients
  subDishesWithData.value.forEach(subDish => {
    if (subDish.dish.ingredients && subDish.dish.ingredients.length > 0) {
      const subServings = servings * (subDish.scalingFactor || 1)
      subDish.dish.ingredients.forEach(ing => {
        ingredients.push({
          ...ing,
          scaledAmount: ing.amount ? Math.round(ing.amount * subServings * 10) / 10 : null,
          sourceDish: subDish.dish.name,
          sourceDishId: subDish.dish.id
        })
      })
    }
  })

  return ingredients
})

function openRecipeUrl() {
  if (hasRecipeUrl.value) {
    // In PWA mode (standalone), use window.location for in-app browser
    // Otherwise, open in new tab
    const isPWA = window.matchMedia('(display-mode: standalone)').matches

    if (isPWA) {
      window.location.href = props.dish.recipeUrl
    } else {
      window.open(props.dish.recipeUrl, '_blank')
    }
  }
}

function close() {
  show.value = false
}
</script>

<template>
  <v-dialog v-model="show" fullscreen :scrim="false" transition="dialog-bottom-transition">
    <v-card>
      <!-- Header with safe area padding for PWA mode -->
      <v-toolbar color="primary" density="compact" class="safe-area-top">
        <v-btn icon="mdi-close" @click="close" />
        <v-toolbar-title>{{ dish?.name || 'Rezept' }}</v-toolbar-title>
        <v-spacer />
        <v-btn v-if="hasRecipeUrl" variant="text" @click="openRecipeUrl">
          <v-icon start icon="mdi-open-in-new" />
          Website
        </v-btn>
      </v-toolbar>

      <v-card-text class="pa-4">
        <v-container>
          <!-- SubDishes List -->
          <v-row v-if="subDishesWithData.length > 0">
            <v-col cols="12">
              <v-card variant="outlined" class="mb-4">
                <v-card-title class="d-flex align-center">
                  <v-icon icon="mdi-food-variant" class="mr-2" />
                  Untergerichte
                </v-card-title>
                <v-card-text>
                  <v-list density="compact">
                    <v-list-item v-for="subDish in subDishesWithData" :key="subDish.dishId">
                      <v-list-item-title>
                        {{ subDish.dish.name }}
                      </v-list-item-title>
                      <v-list-item-subtitle v-if="subDish.scalingFactor !== 1">
                        Faktor: {{ subDish.scalingFactor }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-list>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>

          <v-row>
            <!-- Ingredients Section -->
            <v-col v-if="scaledIngredients.length > 0" cols="12" md="4">
              <v-card variant="tonal" color="primary" class="mb-4">
                <v-card-title class="d-flex align-center">
                  <v-icon icon="mdi-basket" class="mr-2" />
                  Zutaten
                  <v-chip v-if="servings" size="small" class="ml-2">
                    {{ servings }} Portionen
                  </v-chip>
                </v-card-title>
                <v-card-text>
                  <v-list density="compact" bg-color="transparent">
                    <v-list-item
                      v-for="(ing, idx) in scaledIngredients"
                      :key="idx"
                      class="px-0"
                    >
                      <v-list-item-title>
                        <span v-if="ing.scaledAmount && ing.scaledAmount !== 0">
                          <strong>{{ ing.scaledAmount }} {{ ing.unit }}</strong>
                        </span>
                        {{ ing.productName }}
                        <v-chip v-if="ing.optional" size="x-small" variant="outlined" class="ml-1">
                          optional
                        </v-chip>
                        <v-chip v-if="ing.sourceDish" size="x-small" color="secondary" class="ml-1">
                          {{ ing.sourceDish }}
                        </v-chip>
                      </v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Recipe Instructions Section -->
            <v-col cols="12" :md="scaledIngredients.length > 0 ? 8 : 12">
              <!-- Main dish recipe -->
              <v-card v-if="hasRecipe" variant="outlined" color="primary" class="mb-4">
                <v-card-title class="d-flex align-center">
                  <v-icon icon="mdi-book-open-variant" class="mr-2" />
                  Zubereitung
                </v-card-title>
                <v-card-text>
                  <div class="recipe-text markdown-content" v-html="renderedRecipe"></div>
                </v-card-text>
              </v-card>

              <!-- No recipe available -->
              <v-card v-else-if="!hasRecipe && subDishesWithData.length === 0" variant="flat" color="surface" class="mb-4">
                <v-card-text class="text-center pa-8">
                  <v-icon icon="mdi-book-off-outline" size="64" color="grey" class="mb-4" />
                  <div class="text-h6 mb-2">Keine Zubereitung hinterlegt</div>
                  <div class="text-body-2 text-medium-emphasis mb-4">
                    Für dieses Gericht wurde noch keine Zubereitungsanleitung hinzugefügt.
                  </div>
                  <v-btn v-if="hasRecipeUrl" color="primary" @click="openRecipeUrl">
                    <v-icon start icon="mdi-open-in-new" />
                    Rezept auf Website öffnen
                  </v-btn>
                </v-card-text>
              </v-card>

              <!-- Subdish recipes -->
              <v-card
                v-for="subDish in subDishesWithData"
                :key="subDish.dishId"
                variant="outlined"
                color="secondary"
                class="mb-4"
              >
                <v-card-title class="d-flex align-center">
                  <v-icon icon="mdi-book-open-variant" class="mr-2" />
                  {{ subDish.dish.name }}
                  <v-chip size="small" color="secondary" class="ml-2">
                    Untergericht
                  </v-chip>
                  <v-chip v-if="subDish.scalingFactor !== 1" size="small" class="ml-2">
                    Faktor: {{ subDish.scalingFactor }}
                  </v-chip>
                </v-card-title>
                <v-card-text v-if="subDish.dish.recipe">
                  <div class="recipe-text markdown-content" v-html="marked.parse(subDish.dish.recipe)"></div>
                </v-card-text>
                <v-card-text v-else class="text-medium-emphasis">
                  Keine Zubereitung hinterlegt
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Safe area padding for PWA mode to avoid system status bar */
.safe-area-top {
  padding-top: env(safe-area-inset-top) !important;
  /* Prevent content from overlapping by ensuring the toolbar takes up space */
  min-height: calc(48px + env(safe-area-inset-top)) !important;
}

.recipe-text {
  line-height: 1.8;
  font-size: 1rem;
}

/* Markdown styling */
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  font-weight: 600;
  line-height: 1.3;
}

.markdown-content :deep(h1) {
  font-size: 1.75rem;
}

.markdown-content :deep(h2) {
  font-size: 1.5rem;
}

.markdown-content :deep(h3) {
  font-size: 1.25rem;
}

.markdown-content :deep(p) {
  margin-bottom: 1rem;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.markdown-content :deep(li) {
  margin-bottom: 0.5rem;
}

.markdown-content :deep(code) {
  background-color: rgba(var(--v-theme-primary), 0.1);
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9em;
}

.markdown-content :deep(pre) {
  background-color: rgba(var(--v-theme-primary), 0.05);
  padding: 1rem;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 1rem;
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
}

.markdown-content :deep(strong) {
  font-weight: 600;
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid rgb(var(--v-theme-primary));
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
  opacity: 0.9;
}

.markdown-content :deep(hr) {
  margin: 1.5rem 0;
  border: none;
  border-top: 1px solid rgba(var(--v-theme-primary), 0.2);
}

.markdown-content :deep(a) {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
}
</style>
