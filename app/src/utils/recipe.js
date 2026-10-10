import { marked } from 'marked'
import { formatAmount } from './format'

/**
 * Rezepttext als HTML. Platzhalter {Zutat} bzw. {Zutat, Anteil} werden durch die Menge für die
 * aktuelle Portionenzahl ersetzt (z.B. {Mehl, 0.5} → „100 g Mehl“, wenn die Hälfte gemeint ist).
 */
export function renderRecipe(recipe, ingredients, servings, units) {
  if (!recipe) return ''
  const byName = new Map(ingredients.map(i => [i.productName.toLowerCase(), i]))
  const text = recipe.replace(/\{([^,}]+)(?:\s*,\s*([0-9.,/]+))?\}/g, (match, name, factorText) => {
    const ingredient = byName.get(name.trim().toLowerCase())
    if (!ingredient) return name.trim()
    if (ingredient.amount == null) return ingredient.productName
    const factor = factorText ? Number(factorText.replace(',', '.')) : 1
    if (!Number.isFinite(factor)) return match
    return `**${formatAmount(ingredient.amount * servings * factor, ingredient.unit, units)} ${ingredient.productName}**`
  })
  return marked.parse(text)
}
