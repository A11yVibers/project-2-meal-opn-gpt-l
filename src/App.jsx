import { useEffect, useMemo, useState } from 'react'
import { APPROVED_IMAGES } from './approved-images.js'
import recipesCsv from '../project-assets/recipes.csv?raw'
import recipeIngredientsCsv from '../project-assets/recipe_ingredients.csv?raw'
import recipeStepsCsv from '../project-assets/recipe_steps.csv?raw'
import ingredientsCsv from '../project-assets/ingredients.csv?raw'
import cuisinesCsv from '../project-assets/cuisines.csv?raw'
import mealTypesCsv from '../project-assets/meal_types.csv?raw'
import dietaryCsv from '../project-assets/dietary_tags.csv?raw'
import categoriesCsv from '../project-assets/recipe_categories.csv?raw'
import unitsCsv from '../project-assets/units.csv?raw'

const STORAGE = { recipes: 'mise-recipes', plan: 'mise-plan', shopping: 'mise-shopping' }
const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
const SHOP_CATEGORIES = ['Produce', 'Meat & seafood', 'Dairy & eggs', 'Grains & pantry', 'Oils & condiments', 'Canned & jarred', 'Spices', 'Other']

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const headers = rows.shift() || []
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

const lookups = {
  cuisines: parseCsv(cuisinesCsv), mealTypes: parseCsv(mealTypesCsv), dietary: parseCsv(dietaryCsv),
  categories: parseCsv(categoriesCsv), ingredients: parseCsv(ingredientsCsv), units: parseCsv(unitsCsv),
}
const byId = (rows, idKey, nameKey, id) => rows.find(item => item[idKey] === id)?.[nameKey] || ''
const seedIngredientRows = parseCsv(recipeIngredientsCsv)
const seedStepRows = parseCsv(recipeStepsCsv)
const seedRecipes = parseCsv(recipesCsv).map(row => ({
  id: row.recipe_id, title: row.title, description: row.short_description, source: row.source_name, sourceUrl: row.source_url,
  servings: Number(row.servings), prep: Number(row.prep_time_minutes), cook: Number(row.cook_time_minutes),
  cuisine: byId(lookups.cuisines, 'cuisine_id', 'cuisine_name', row.cuisine_id),
  mealType: byId(lookups.mealTypes, 'meal_type_id', 'meal_type_name', row.meal_type_id),
  dietary: row.dietary_tag_ids.split(',').filter(Boolean).map(id => byId(lookups.dietary, 'dietary_tag_id', 'dietary_tag_name', id)),
  categories: row.category_ids.split(',').filter(Boolean).map(id => byId(lookups.categories, 'category_id', 'category_name', id)),
  spice: Number(row.spice_level_0_to_5), accent: row.accent_color, image: row.cover_image_url, suggestions: row.include_in_meal_suggestions === 'true',
  includeShopping: true, nutrition: false, substitutions: true, measurement: 'US customary',
  ingredients: seedIngredientRows.filter(item => item.recipe_id === row.recipe_id).map(item => ({
    section: item.section_name, ingredientId: item.ingredient_id, name: item.ingredient_name, quantity: item.quantity,
    unit: item.unit, notes: item.notes, optional: item.optional.toLowerCase() === 'true',
  })),
  steps: seedStepRows.filter(item => item.recipe_id === row.recipe_id).map(item => ({ instruction: item.instruction, timer: Number(item.timer_minutes) || '' })),
}))

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value))
const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const startOfWeek = input => { const d = new Date(`${input}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDate(d) }
const shiftDate = (date, days) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return localDate(d) }
const prettyDate = (date, options = {}) => new Intl.DateTimeFormat('en-US', options).format(new Date(`${date}T12:00:00`))
const ingredientBlank = section => ({ section, ingredientId: '', name: '', quantity: '', unit: 'cup', notes: '', optional: false })
const initialForm = () => ({
  title: '', sourceUrl: '', description: '', cuisine: 'American', mealType: 'Dinner', dietary: [], categories: [], servings: 4,
  prep: 10, cook: 20, spice: 1, accent: '#c86647', ingredients: [ingredientBlank('Main')],
  steps: [{ instruction: '', timer: '' }], suggestions: true, addNow: false, planDate: localDate(new Date()), planSlot: 'Dinner', planTime: '18:30',
  includeShopping: true, nutrition: false, substitutions: true, measurement: 'US customary', imageName: '',
})

function Icon({ children }) { return <span aria-hidden="true">{children}</span> }

function App() {
  const [userRecipes, setUserRecipes] = useState(() => load(STORAGE.recipes, []))
  const [plan, setPlan] = useState(() => load(STORAGE.plan, {}))
  const [shoppingState, setShoppingState] = useState(() => load(STORAGE.shopping, { checked: {}, pantry: {} }))
  const [view, setView] = useState('recipes')
  const [selectedId, setSelectedId] = useState(null)
  const [week, setWeek] = useState(() => startOfWeek(localDate(new Date())))
  const [slotPicker, setSlotPicker] = useState(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(initialForm)
  const recipes = [...seedRecipes, ...userRecipes]

  useEffect(() => save(STORAGE.recipes, userRecipes), [userRecipes])
  useEffect(() => save(STORAGE.plan, plan), [plan])
  useEffect(() => save(STORAGE.shopping, shoppingState), [shoppingState])

  const days = Array.from({ length: 7 }, (_, index) => shiftDate(week, index))
  const currentPlanEntries = Object.entries(plan).filter(([key]) => days.some(day => key.startsWith(`${day}|`)))
  const shopping = useMemo(() => {
    const combined = {}
    currentPlanEntries.forEach(([, recipeId]) => {
      const recipe = recipes.find(item => item.id === recipeId)
      if (!recipe?.includeShopping) return
      recipe.ingredients.filter(item => !item.optional).forEach(item => {
        const key = `${item.name}|${item.unit}`
        if (!combined[key]) combined[key] = { ...item, quantity: 0, recipes: new Set() }
        const amount = Number(item.quantity)
        combined[key].quantity = Number.isFinite(amount) ? combined[key].quantity + amount : item.quantity
        combined[key].recipes.add(recipe.title)
      })
    })
    return Object.entries(combined).map(([key, item]) => ({ ...item, key, recipes: [...item.recipes], category: lookups.ingredients.find(i => i.ingredient_name === item.name)?.shopping_category || 'Other' }))
  }, [plan, week, userRecipes])

  const openRecipe = id => { setSelectedId(id); setView('detail'); window.scrollTo(0, 0) }
  const setPlanSlot = (date, slot, recipeId) => {
    const key = `${date}|${slot}`
    setPlan(current => { const next = { ...current }; if (recipeId) next[key] = recipeId; else delete next[key]; return next })
    setSlotPicker(null)
  }
  const updateList = (field, value) => setForm(current => ({ ...current, [field]: current[field].includes(value) ? current[field].filter(item => item !== value) : [...current[field], value] }))
  const updateIngredient = (index, patch) => setForm(current => ({ ...current, ingredients: current.ingredients.map((item, i) => i === index ? { ...item, ...patch } : item) }))
  const moveItem = (field, index, direction) => setForm(current => { const items = [...current[field]]; const target = index + direction; if (target < 0 || target >= items.length) return current; [items[index], items[target]] = [items[target], items[index]]; return { ...current, [field]: items } })

  function submitRecipe(event) {
    event.preventDefault()
    const id = `U${Date.now()}`
    const recipe = { ...form, id, source: form.sourceUrl ? 'Personal collection' : '', image: '', total: Number(form.prep) + Number(form.cook) }
    setUserRecipes(current => [...current, recipe])
    if (form.addNow) setPlan(current => ({ ...current, [`${form.planDate}|${form.planSlot}`]: id }))
    setForm(initialForm())
    setSelectedId(id)
    setView('detail')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView('recipes')} aria-label="Mise home"><span className="brand-mark">M</span><span>Mise</span></button>
        <nav aria-label="Primary navigation">
          {[['recipes', 'Recipes'], ['planner', 'Meal plan'], ['shopping', 'Shopping list']].map(([id, label]) => <button key={id} className={view === id || (id === 'recipes' && view === 'detail') ? 'active' : ''} onClick={() => setView(id)}>{label}</button>)}
        </nav>
        <button className="primary compact" onClick={() => setView('create')}><Icon>＋</Icon> New recipe</button>
      </header>

      {view === 'recipes' && <main className="page catalog-page">
        <section className="hero">
          <div><p className="eyebrow">Your kitchen, organized</p><h1>What are we cooking?</h1><p>Keep the recipes you love close at hand, then turn them into a plan.</p></div>
          <div className="hero-stat"><strong>{recipes.length}</strong><span>recipes in your collection</span></div>
        </section>
        <div className="catalog-tools">
          <label className="search"><span className="sr-only">Search recipes</span><Icon>⌕</Icon><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your recipes..." /></label>
          <button className="primary" onClick={() => setView('create')}>Add a recipe</button>
        </div>
        <section aria-labelledby="all-recipes"><div className="section-heading"><div><p className="eyebrow">The collection</p><h2 id="all-recipes">All recipes</h2></div><span>{recipes.filter(r => `${r.title} ${r.cuisine} ${r.mealType}`.toLowerCase().includes(search.toLowerCase())).length} results</span></div>
          <div className="recipe-grid">{recipes.filter(r => `${r.title} ${r.cuisine} ${r.mealType}`.toLowerCase().includes(search.toLowerCase())).map(recipe => <RecipeCard key={recipe.id} recipe={recipe} onOpen={() => openRecipe(recipe.id)} />)}</div>
        </section>
      </main>}

      {view === 'detail' && <RecipeDetail recipe={recipes.find(recipe => recipe.id === selectedId) || recipes[0]} onBack={() => setView('recipes')} onPlan={() => { setSlotPicker({ date: days[0], slot: 'Dinner', recipeId: selectedId }); setView('planner') }} />}
      {view === 'create' && <RecipeForm form={form} setForm={setForm} submit={submitRecipe} updateList={updateList} updateIngredient={updateIngredient} moveItem={moveItem} onCancel={() => setView('recipes')} />}
      {view === 'planner' && <Planner week={week} setWeek={setWeek} days={days} plan={plan} recipes={recipes} picker={slotPicker} setPicker={setSlotPicker} setPlanSlot={setPlanSlot} />}
      {view === 'shopping' && <Shopping week={week} shopping={shopping} state={shoppingState} setState={setShoppingState} goPlanner={() => setView('planner')} />}
    </div>
  )
}

function RecipeCard({ recipe, onOpen }) {
  return <article className="recipe-card" style={{ '--accent': recipe.accent }}><button className="card-hit" onClick={onOpen} aria-label={`View ${recipe.title}`}><div className="card-image"><img src={recipe.image || APPROVED_IMAGES.placeholder} alt="" /><span>{recipe.mealType}</span></div><div className="card-body"><div className="meta"><span>{recipe.cuisine}</span><span>·</span><span>{Number(recipe.prep) + Number(recipe.cook)} min</span></div><h3>{recipe.title}</h3><p>{recipe.description || 'A recipe saved to your personal kitchen collection.'}</p><div className="card-foot"><span>Serves {recipe.servings}</span><span className="view-link">View recipe →</span></div></div></button></article>
}

function RecipeDetail({ recipe, onBack, onPlan }) {
  if (!recipe) return null
  const sections = [...new Set(recipe.ingredients.map(item => item.section))]
  return <main className="detail-page">
    <button className="back-link" onClick={onBack}>← All recipes</button>
    <section className="detail-hero" style={{ '--accent': recipe.accent }}><div className="detail-photo"><img src={recipe.image || APPROVED_IMAGES.placeholder} alt="" /></div><div className="detail-intro"><p className="eyebrow">{recipe.cuisine} · {recipe.mealType}</p><h1>{recipe.title}</h1><p className="lead">{recipe.description}</p><div className="tags">{recipe.dietary.map(tag => <span key={tag}>{tag}</span>)}</div><div className="detail-actions"><button className="primary" onClick={onPlan}>Add to meal plan</button>{recipe.sourceUrl && <a className="secondary" href={recipe.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>}</div></div></section>
    <section className="quick-facts" aria-label="Recipe facts"><div><span>Prep</span><strong>{recipe.prep} min</strong></div><div><span>Cook</span><strong>{recipe.cook} min</strong></div><div><span>Total</span><strong>{Number(recipe.prep) + Number(recipe.cook)} min</strong></div><div><span>Yield</span><strong>{recipe.servings} servings</strong></div><div><span>Spice</span><strong>{['None', 'Mild', 'Warm', 'Medium', 'Hot', 'Very spicy'][recipe.spice] || 'Mild'}</strong></div></section>
    <div className="recipe-content"><section><p className="eyebrow">What you’ll need</p><h2>Ingredients</h2>{sections.map(section => <div className="ingredient-section" key={section}><h3>{section}</h3><ul>{recipe.ingredients.filter(item => item.section === section).map((item, i) => <li key={`${item.name}-${i}`}><span>{item.quantity} {item.unit}</span><strong>{item.name}</strong>{item.notes && <small>{item.notes}</small>}{item.optional && <em>optional</em>}</li>)}</ul></div>)}</section><section><p className="eyebrow">Step by step</p><h2>Method</h2><ol className="method-list">{recipe.steps.map((step, i) => <li key={i}><span>{i + 1}</span><div><p>{step.instruction}</p>{step.timer && <small>◷ {step.timer} minutes</small>}</div></li>)}</ol></section></div>
  </main>
}

function RecipeForm({ form, setForm, submit, updateList, updateIngredient, moveItem, onCancel }) {
  const field = (key, value) => setForm(current => ({ ...current, [key]: value }))
  return <main className="page form-page"><div className="form-title"><button className="back-link" onClick={onCancel}>← Back to recipes</button><p className="eyebrow">Personal collection</p><h1>Add a new recipe</h1><p>Capture the details once, then cook from it whenever you like.</p></div>
    <form onSubmit={submit}>
      <FormSection number="01" title="Recipe details" description="The essentials that make this recipe easy to find."><div className="fields two"><label className="full">Recipe title<input required value={form.title} onChange={e => field('title', e.target.value)} placeholder="e.g. Sunday lemon chicken" /></label><label className="full">Short description<textarea value={form.description} onChange={e => field('description', e.target.value)} placeholder="What makes this recipe special?" /></label><label>Source link<input type="url" value={form.sourceUrl} onChange={e => field('sourceUrl', e.target.value)} placeholder="https://" /></label><label>Cuisine<select value={form.cuisine} onChange={e => field('cuisine', e.target.value)}>{lookups.cuisines.map(x => <option key={x.cuisine_id}>{x.cuisine_name}</option>)}</select></label><label>Primary meal type<select value={form.mealType} onChange={e => field('mealType', e.target.value)}>{lookups.mealTypes.map(x => <option key={x.meal_type_id}>{x.meal_type_name}</option>)}</select></label></div><CheckGroup label="Dietary suitability" rows={lookups.dietary} idKey="dietary_tag_id" nameKey="dietary_tag_name" selected={form.dietary} toggle={value => updateList('dietary', value)} /><CheckGroup label="Recipe categories" rows={lookups.categories} idKey="category_id" nameKey="category_name" selected={form.categories} toggle={value => updateList('categories', value)} /></FormSection>
      <FormSection number="02" title="Timing & yield" description="Help future you know exactly what to expect."><div className="fields four"><label>Servings<input type="number" min="1" value={form.servings} onChange={e => field('servings', e.target.value)} /></label><label>Prep time <small>minutes</small><input type="number" min="0" value={form.prep} onChange={e => field('prep', e.target.value)} /></label><label>Cook time <small>minutes</small><input type="number" min="0" value={form.cook} onChange={e => field('cook', e.target.value)} /></label><label>Total time <small>calculated</small><output className="input-output">{Number(form.prep) + Number(form.cook)} min</output></label></div><label className="range-label">Spice level <strong>{['No heat', 'Mild', 'Warm', 'Medium', 'Hot', 'Very spicy'][form.spice]}</strong><input type="range" min="0" max="5" value={form.spice} onChange={e => field('spice', Number(e.target.value))} /><span><small>No heat</small><small>Very spicy</small></span></label></FormSection>
      <FormSection number="03" title="Image & appearance" description="Give your recipe card a little personality."><div className="fields two"><label>Cover image<input type="file" accept="image/*" onChange={e => field('imageName', e.target.files[0]?.name || '')} /><small>{form.imageName || 'Images are represented by the collection placeholder.'}</small></label><fieldset><legend>Card accent</legend><div className="swatches">{['#c86647', '#dda15e', '#607c64', '#375a63', '#815c72'].map(color => <button type="button" key={color} aria-label={`Choose ${color} accent`} aria-pressed={form.accent === color} style={{ background: color }} onClick={() => field('accent', color)} />)}</div></fieldset></div></FormSection>
      <FormSection number="04" title="Ingredients" description="Group the list the way you cook: main, sauce, garnish, and more.">{form.ingredients.map((item, index) => <div className="ingredient-row" key={index}><label>Section<input value={item.section} onChange={e => updateIngredient(index, { section: e.target.value })} placeholder="Main" /></label><label className="ingredient-name">Ingredient<input required list="ingredients" value={item.name} onChange={e => { const match = lookups.ingredients.find(x => x.ingredient_name === e.target.value); updateIngredient(index, { name: e.target.value, ingredientId: match?.ingredient_id || '' }) }} placeholder="Search ingredient" /></label><label>Quantity<input required value={item.quantity} onChange={e => updateIngredient(index, { quantity: e.target.value })} /></label><label>Unit<select value={item.unit} onChange={e => updateIngredient(index, { unit: e.target.value })}>{lookups.units.map(x => <option key={x.unit_id}>{x.unit_name}</option>)}</select></label><label className="optional"><input type="checkbox" checked={item.optional} onChange={e => updateIngredient(index, { optional: e.target.checked })} /> Optional</label><div className="row-actions"><button type="button" onClick={() => moveItem('ingredients', index, -1)} aria-label="Move ingredient up">↑</button><button type="button" onClick={() => moveItem('ingredients', index, 1)} aria-label="Move ingredient down">↓</button><button type="button" onClick={() => setForm(current => ({ ...current, ingredients: current.ingredients.filter((_, i) => i !== index) }))} aria-label="Remove ingredient">×</button></div></div>)}<datalist id="ingredients">{lookups.ingredients.map(x => <option key={x.ingredient_id} value={x.ingredient_name} />)}</datalist><div className="add-row"><button type="button" className="secondary" onClick={() => setForm(current => ({ ...current, ingredients: [...current.ingredients, ingredientBlank(current.ingredients.at(-1)?.section || 'Main')] }))}>＋ Add ingredient</button><button type="button" className="text-button" onClick={() => setForm(current => ({ ...current, ingredients: [...current.ingredients, ingredientBlank('New section')] }))}>＋ Add ingredient section</button></div></FormSection>
      <FormSection number="05" title="Method" description="Keep every step clear, concise, and in order.">{form.steps.map((step, index) => <div className="step-row" key={index}><span>{index + 1}</span><label>Instruction<textarea required value={step.instruction} onChange={e => setForm(current => ({ ...current, steps: current.steps.map((x, i) => i === index ? { ...x, instruction: e.target.value } : x) }))} placeholder="Describe this step..." /></label><label>Timer <small>minutes</small><input type="number" min="0" value={step.timer} onChange={e => setForm(current => ({ ...current, steps: current.steps.map((x, i) => i === index ? { ...x, timer: e.target.value } : x) }))} /></label><div className="row-actions"><button type="button" onClick={() => moveItem('steps', index, -1)} aria-label="Move step up">↑</button><button type="button" onClick={() => moveItem('steps', index, 1)} aria-label="Move step down">↓</button><button type="button" onClick={() => setForm(current => ({ ...current, steps: current.steps.filter((_, i) => i !== index) }))} aria-label="Remove step">×</button></div></div>)}<button type="button" className="secondary" onClick={() => setForm(current => ({ ...current, steps: [...current.steps, { instruction: '', timer: '' }] }))}>＋ Add step</button></FormSection>
      <FormSection number="06" title="Meal planning" description="Make this recipe ready for the week ahead."><Toggle checked={form.suggestions} onChange={value => field('suggestions', value)} title="Available in meal-plan suggestions" text="Show this recipe when choosing meals for an open slot." /><Toggle checked={form.addNow} onChange={value => field('addNow', value)} title="Add to meal plan now" text="Schedule it as soon as the recipe is saved." />{form.addNow && <div className="plan-options"><label>Planning week<input type="week" value={startOfWeek(form.planDate).slice(0, 7) + '-W' + getWeekNumber(form.planDate)} readOnly aria-describedby="week-note" /><small id="week-note">Set automatically from cooking date</small></label><label>Cooking date<input type="date" value={form.planDate} onChange={e => field('planDate', e.target.value)} /></label><label>Meal slot<select value={form.planSlot} onChange={e => field('planSlot', e.target.value)}>{SLOTS.map(x => <option key={x}>{x}</option>)}</select></label><label>Serving time<input type="time" value={form.planTime} onChange={e => field('planTime', e.target.value)} /></label></div>}</FormSection>
      <FormSection number="07" title="Recipe options" description="Fine-tune how this recipe behaves across Mise."><div className="option-menu"><Toggle checked={form.includeShopping} onChange={value => field('includeShopping', value)} title="Include ingredients in shopping lists" /><Toggle checked={form.nutrition} onChange={value => field('nutrition', value)} title="Show nutrition information" /><Toggle checked={form.substitutions} onChange={value => field('substitutions', value)} title="Allow ingredient substitutions" /><fieldset><legend>Measurements</legend><div className="segment">{['US customary', 'Metric'].map(value => <button type="button" key={value} aria-pressed={form.measurement === value} onClick={() => field('measurement', value)}>{value}</button>)}</div></fieldset></div></FormSection>
      <div className="form-submit"><button type="button" className="text-button" onClick={onCancel}>Cancel</button><button className="primary" type="submit">Save recipe</button></div>
    </form></main>
}

function getWeekNumber(value) { const date = new Date(`${value}T12:00:00`); const first = new Date(date.getFullYear(), 0, 1); return String(Math.ceil((((date - first) / 86400000) + first.getDay() + 1) / 7)).padStart(2, '0') }
function FormSection({ number, title, description, children }) { return <section className="form-section"><div className="form-section-head"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div><div className="form-section-body">{children}</div></section> }
function CheckGroup({ label, rows, idKey, nameKey, selected, toggle }) { return <fieldset className="check-group"><legend>{label}</legend><div>{rows.map(row => <label key={row[idKey]} className={selected.includes(row[nameKey]) ? 'selected' : ''}><input type="checkbox" checked={selected.includes(row[nameKey])} onChange={() => toggle(row[nameKey])} />{row[nameKey]}</label>)}</div></fieldset> }
function Toggle({ checked, onChange, title, text }) { return <label className="toggle-row"><span><strong>{title}</strong>{text && <small>{text}</small>}</span><input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} /></label> }

function Planner({ week, setWeek, days, plan, recipes, picker, setPicker, setPlanSlot }) {
  return <main className="page planner-page"><header className="page-heading"><div><p className="eyebrow">Seven days, one clear view</p><h1>Weekly meal plan</h1><p>Build a week that works for your table.</p></div><div className="week-nav"><button onClick={() => setWeek(shiftDate(week, -7))} aria-label="Previous week">←</button><strong>{prettyDate(week, { month: 'short', day: 'numeric' })} – {prettyDate(shiftDate(week, 6), { month: 'short', day: 'numeric', year: 'numeric' })}</strong><button onClick={() => setWeek(shiftDate(week, 7))} aria-label="Next week">→</button></div></header>
    <div className="planner-grid">{days.map(date => <section className="day-column" key={date}><header className={date === localDate(new Date()) ? 'today' : ''}><span>{prettyDate(date, { weekday: 'short' })}</span><strong>{prettyDate(date, { day: 'numeric' })}</strong></header>{SLOTS.map(slot => { const key = `${date}|${slot}`; const recipe = recipes.find(item => item.id === plan[key]); return <div className={`meal-slot ${recipe ? 'filled' : ''}`} key={slot}><span>{slot}</span>{recipe ? <><button className="planned-recipe" onClick={() => setPicker({ date, slot, recipeId: recipe.id })}><i style={{ background: recipe.accent }} /><strong>{recipe.title}</strong><small>{Number(recipe.prep) + Number(recipe.cook)} min</small></button><button className="remove-meal" onClick={() => setPlanSlot(date, slot, '')} aria-label={`Remove ${recipe.title}`}>×</button></> : <button className="empty-slot" onClick={() => setPicker({ date, slot })}>＋ Add meal</button>}</div>})}</section>)}</div>
    {picker && <div className="modal-backdrop" onMouseDown={() => setPicker(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="picker-title" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={() => setPicker(null)} aria-label="Close">×</button><p className="eyebrow">{prettyDate(picker.date, { weekday: 'long', month: 'long', day: 'numeric' })} · {picker.slot}</p><h2 id="picker-title">Choose a recipe</h2><div className="picker-list">{recipes.filter(r => r.suggestions !== false).map(recipe => <button key={recipe.id} className={picker.recipeId === recipe.id ? 'selected' : ''} onClick={() => setPlanSlot(picker.date, picker.slot, recipe.id)}><img src={recipe.image || APPROVED_IMAGES.placeholder} alt="" /><span><strong>{recipe.title}</strong><small>{recipe.cuisine} · {Number(recipe.prep) + Number(recipe.cook)} min</small></span><b>＋</b></button>)}</div></section></div>}
  </main>
}

function Shopping({ week, shopping, state, setState, goPlanner }) {
  const visible = shopping.filter(item => !state.pantry[item.key])
  const completed = visible.filter(item => state.checked[item.key]).length
  const toggle = (field, key) => setState(current => ({ ...current, [field]: { ...current[field], [key]: !current[field][key] } }))
  return <main className="page shopping-page"><header className="page-heading"><div><p className="eyebrow">Generated from your plan</p><h1>Shopping list</h1><p>Week of {prettyDate(week, { month: 'long', day: 'numeric' })}. Repeated ingredients are combined by unit.</p></div><div className="list-progress"><strong>{completed}/{visible.length}</strong><span>items gathered</span></div></header>
    {shopping.length === 0 ? <section className="empty-state"><span>⌑</span><h2>Your list is waiting</h2><p>Add recipes to this week’s meal plan and their ingredients will appear here.</p><button className="primary" onClick={goPlanner}>Plan the week</button></section> : <div className="shopping-layout"><div>{SHOP_CATEGORIES.map(category => { const items = visible.filter(item => item.category === category); if (!items.length) return null; return <section className="shopping-category" key={category}><h2>{category}<span>{items.length}</span></h2>{items.map(item => <div className={`shopping-item ${state.checked[item.key] ? 'checked' : ''}`} key={item.key}><label><input type="checkbox" checked={!!state.checked[item.key]} onChange={() => toggle('checked', item.key)} /><span><strong>{item.name}</strong><small>For {item.recipes.join(', ')}</small></span></label><b>{item.quantity} {item.unit}</b><button onClick={() => toggle('pantry', item.key)}>I have this</button></div>)}</section> })}</div><aside><h2>In your pantry</h2><p>Hidden items won’t clutter this week’s list.</p>{shopping.filter(item => state.pantry[item.key]).map(item => <button key={item.key} onClick={() => toggle('pantry', item.key)}>{item.name}<span>Restore</span></button>)}{!shopping.some(item => state.pantry[item.key]) && <small>No ingredients excluded yet.</small>}</aside></div>}
  </main>
}

export default App
