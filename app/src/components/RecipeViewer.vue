<script setup>
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps({
  modelValue: Boolean,
  dish: Object,
  servings: Number
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

const renderedRecipe = computed(() => {
  if (!hasRecipe.value) return ''
  return marked.parse(props.dish.recipe)
})

// Scale ingredient amounts based on servings
const scaledIngredients = computed(() => {
  if (!hasIngredients.value) return []

  const dishServings = props.dish.defaultServings || 1
  const scale = props.servings / dishServings

  return props.dish.ingredients.map(ing => ({
    ...ing,
    scaledAmount: ing.amount ? Math.round(ing.amount * scale * 10) / 10 : null
  }))
})

function openRecipeUrl() {
  if (hasRecipeUrl.value) {
    window.location.href = props.dish.recipeUrl
  }
}

function close() {
  show.value = false
}
</script>

<template>
  <v-dialog v-model="show" fullscreen :scrim="false" transition="dialog-bottom-transition">
    <v-card>
      <!-- Header -->
      <v-toolbar color="primary" density="compact">
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
          <v-row>
            <!-- Ingredients Section -->
            <v-col v-if="hasIngredients" cols="12" md="4">
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
                      v-for="ing in scaledIngredients"
                      :key="ing.id"
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
                      </v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Recipe Instructions Section -->
            <v-col cols="12" :md="hasIngredients ? 8 : 12">
              <v-card v-if="hasRecipe" variant="outlined" color="primary">
                <v-card-title class="d-flex align-center">
                  <v-icon icon="mdi-book-open-variant" class="mr-2" />
                  Zubereitung
                </v-card-title>
                <v-card-text>
                  <div class="recipe-text markdown-content" v-html="renderedRecipe"></div>
                </v-card-text>
              </v-card>

              <!-- No recipe available -->
              <v-card v-else variant="flat" color="surface">
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
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
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
