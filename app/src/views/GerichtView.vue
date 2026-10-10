<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataStore } from '@/stores'
import { formatAmount, formatNumber } from '@/utils/format'
import { renderRecipe } from '@/utils/recipe'

const route = useRoute()
const router = useRouter()
const data = useDataStore()

const dish = computed(() => data.dishById.get(route.params.id) ?? null)
const servings = ref(Number(route.query.servings) || null)
watch(dish, d => { if (d && !servings.value) servings.value = d.servings }, { immediate: true })

// Gewählte Beilagen kommen per Query (?beilagen=id,id) aus dem Plan
const chosen = computed(() => String(route.query.beilagen ?? '').split(',').filter(Boolean))
const excluded = computed(() => new Set(String(route.query.ohne ?? '').split(',').filter(Boolean)))

const blocks = computed(() => {
  if (!dish.value) return []
  const result = [{ title: null, dish: dish.value, factor: 1 }]
  for (const c of dish.value.components) {
    if (c.optional && !chosen.value.includes(c.dishId)) continue
    const component = data.dishById.get(c.dishId)
    if (component) result.push({ title: component.name, dish: component, factor: c.factor })
  }
  return result
})

const scale = block => (servings.value || 1) * block.factor
const recipeHtml = block => renderRecipe(block.dish.recipe, block.dish.ingredients, scale(block), data.units)
</script>

<template>
  <div v-if="!dish" class="text-center pa-8"><v-progress-circular indeterminate color="primary" /></div>
  <div v-else>
    <div class="d-flex align-start mb-3">
      <div class="flex-grow-1">
        <h1 class="text-h5">{{ dish.name }}</h1>
        <div class="text-caption text-medium-emphasis">{{ dish.categories.join(', ') }}<span v-if="dish.status === 'draft'"> · Entwurf</span></div>
      </div>
      <v-btn icon="mdi-pencil-outline" variant="text" @click="router.push(`/verwaltung/gerichte/${dish.id}`)" />
    </div>

    <div v-if="dish.kind !== 'takeaway'" class="d-flex align-center mb-4">
      <span class="mr-4 text-body-2">Portionen</span>
      <v-btn icon="mdi-minus" size="small" variant="tonal" :disabled="servings <= 0.5" @click="servings = Math.max(0.5, servings - (servings > 1 ? 1 : 0.5))" />
      <span class="text-h6 mx-4">{{ formatNumber(servings) }}</span>
      <v-btn icon="mdi-plus" size="small" variant="tonal" @click="servings = servings < 1 ? 1 : servings + 1" />
    </div>
    <p v-if="dish.kind === 'takeaway'" class="text-body-1">Wird geholt<span v-if="dish.takeawayWhere"> – {{ dish.takeawayWhere }}</span>.</p>

    <v-card v-for="block in blocks" :key="block.dish.id" class="mb-3">
      <v-card-title v-if="block.title" class="text-subtitle-1">{{ block.title }}</v-card-title>
      <v-card-text>
        <div v-if="block.dish.ingredients.length" class="ingredients mb-3">
          <div v-for="ing in block.dish.ingredients" :key="ing.id" class="d-flex py-1" :class="{ 'text-disabled text-decoration-line-through': excluded.has(ing.id) }">
            <span class="amount text-medium-emphasis">{{ ing.amount != null ? formatAmount(ing.amount * scale(block), ing.unit, data.units) : '' }}</span>
            <span>{{ ing.productName }}<span v-if="ing.optional" class="text-caption text-medium-emphasis"> (optional)</span></span>
          </div>
        </div>
        <div v-if="block.dish.preparations.length" class="mb-3">
          <div v-for="p in block.dish.preparations" :key="p.text" class="text-body-2">
            <v-icon icon="mdi-clock-outline" size="small" class="mr-1" />{{ formatNumber(p.leadHours) }} h vorher: {{ p.text }}
          </div>
        </div>
        <div v-if="block.dish.recipe" class="recipe" v-html="recipeHtml(block)" />
        <div v-else-if="block.dish.kind === 'cook'" class="text-body-2 text-medium-emphasis">
          Noch kein Rezept hinterlegt.
          <a v-if="block.dish.sourceUrl" :href="block.dish.sourceUrl" target="_blank" rel="noopener">Zur Quelle</a>
        </div>
        <a v-if="block.dish.recipe && block.dish.sourceUrl" :href="block.dish.sourceUrl" target="_blank" rel="noopener" class="text-caption">Quelle</a>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.amount { min-width: 96px; text-align: right; margin-right: 12px; }
.recipe :deep(ol), .recipe :deep(ul) { padding-left: 1.4em; }
.recipe :deep(li) { margin-bottom: 0.6em; line-height: 1.5; }
.recipe :deep(p) { margin-bottom: 0.6em; line-height: 1.5; }
</style>
