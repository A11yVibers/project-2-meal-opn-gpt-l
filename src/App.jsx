import { useEffect, useMemo, useState } from 'react'
import { APPROVED_IMAGES } from './approved-images'
import recipesCsv from '../project-assets/recipes.csv?raw'
import ingredientsCsv from '../project-assets/ingredients.csv?raw'
import recipeIngredientsCsv from '../project-assets/recipe_ingredients.csv?raw'
import stepsCsv from '../project-assets/recipe_steps.csv?raw'
import cuisinesCsv from '../project-assets/cuisines.csv?raw'
import mealTypesCsv from '../project-assets/meal_types.csv?raw'
import dietaryCsv from '../project-assets/dietary_tags.csv?raw'
import categoriesCsv from '../project-assets/recipe_categories.csv?raw'
import unitsCsv from '../project-assets/units.csv?raw'

const parseCsv = (text) => {
  const rows = []; let row = []; let cell = ''; let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell); cell = '' }
    else if (char === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const headers = rows.shift()
  return rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])))
}

const lookups = {
  cuisines: parseCsv(cuisinesCsv), mealTypes: parseCsv(mealTypesCsv), dietary: parseCsv(dietaryCsv),
  categories: parseCsv(categoriesCsv), units: parseCsv(unitsCsv), ingredients: parseCsv(ingredientsCsv),
}
const lookupName = (list, id, idKey, nameKey) => list.find((item) => item[idKey] === id)?.[nameKey] || id
const seedIngredientRows = parseCsv(recipeIngredientsCsv)
const seedStepRows = parseCsv(stepsCsv)
const seedRecipes = parseCsv(recipesCsv).map((recipe) => ({
  id: recipe.recipe_id, title: recipe.title, description: recipe.short_description, sourceUrl: recipe.source_url,
  servings: Number(recipe.servings), prep: Number(recipe.prep_time_minutes), cook: Number(recipe.cook_time_minutes),
  cuisine: lookupName(lookups.cuisines, recipe.cuisine_id, 'cuisine_id', 'cuisine_name'),
  mealType: lookupName(lookups.mealTypes, recipe.meal_type_id, 'meal_type_id', 'meal_type_name'),
  dietary: recipe.dietary_tag_ids.split(',').map((id) => lookupName(lookups.dietary, id, 'dietary_tag_id', 'dietary_tag_name')),
  categories: recipe.category_ids.split(',').map((id) => lookupName(lookups.categories, id, 'category_id', 'category_name')),
  spice: Number(recipe.spice_level_0_to_5), accent: recipe.accent_color, image: recipe.cover_image_url,
  suggestions: recipe.include_in_meal_suggestions === 'true', includeShopping: true, nutrition: false, substitutions: true, measurement: 'US',
  ingredients: seedIngredientRows.filter((i) => i.recipe_id === recipe.recipe_id).map((i) => ({
    section: i.section_name, ingredientId: i.ingredient_id, name: i.ingredient_name, quantity: Number(i.quantity), unit: i.unit,
    notes: i.notes, optional: i.optional.toLowerCase() === 'true',
  })),
  steps: seedStepRows.filter((s) => s.recipe_id === recipe.recipe_id).map((s) => ({ text: s.instruction, timer: Number(s.timer_minutes) })),
}))

const mealSlots = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
const categoryOrder = ['Produce', 'Meat & seafood', 'Dairy & eggs', 'Grains & pantry', 'Oils & condiments', 'Canned & jarred', 'Spices']
const iso = (date) => date.toISOString().slice(0, 10)
const mondayOf = (date) => { const d = new Date(date); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d }
const shiftDate = (date, days) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return iso(d) }
const prettyDate = (date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const move = (items, index, delta) => { const next = [...items]; const target = index + delta; if (target < 0 || target >= next.length) return items; [next[index], next[target]] = [next[target], next[index]]; return next }

function Toggle({ checked, onChange, label }) {
  return <label className="toggle-row"><span>{label}</span><button type="button" className={`toggle ${checked ? 'on' : ''}`} aria-pressed={checked} onClick={() => onChange(!checked)}><span /></button></label>
}

function Modal({ children, onClose, wide = false }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide ? 'wide' : ''}`} onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>
}

function RecipeCard({ recipe, onOpen, onPlan }) {
  return <article className="recipe-card" style={{ '--accent': recipe.accent }}>
    <button className="card-image" onClick={onOpen}><img src={recipe.image || APPROVED_IMAGES.placeholder} alt="" /><span>{recipe.mealType}</span></button>
    <div className="card-copy"><div className="eyebrow">{recipe.cuisine} kitchen</div><button className="title-button" onClick={onOpen}>{recipe.title}</button>
      <p>{recipe.description || 'A new recipe ready for your weekly rotation.'}</p>
      <div className="card-meta"><span>{recipe.prep + recipe.cook} min</span><span>{recipe.servings} servings</span><button className="mini-plan" onClick={onPlan}>+ Plan</button></div>
    </div>
  </article>
}

function RecipeDetail({ recipe, onClose, onPlan }) {
  const sections = [...new Set(recipe.ingredients.map((item) => item.section))]
  return <Modal onClose={onClose} wide><button className="close" onClick={onClose}>Close</button>
    <div className="detail-hero" style={{ '--accent': recipe.accent }}><img src={recipe.image || APPROVED_IMAGES.placeholder} alt="" /><div><div className="eyebrow">{recipe.cuisine} / {recipe.mealType}</div><h2>{recipe.title}</h2><p>{recipe.description}</p><div className="detail-stats"><span><b>{recipe.prep}</b> prep</span><span><b>{recipe.cook}</b> cook</span><span><b>{recipe.servings}</b> servings</span><span><b>{'●'.repeat(Math.max(1, recipe.spice))}</b> spice</span></div><button className="primary" onClick={onPlan}>Add to meal plan</button></div></div>
    <div className="detail-grid"><section><div className="section-kicker">What you'll need</div><h3>Ingredients</h3>{sections.map((section) => <div className="ingredient-section" key={section}><h4>{section}</h4>{recipe.ingredients.filter((item) => item.section === section).map((item, i) => <div className="detail-ingredient" key={`${item.name}-${i}`}><b>{item.quantity} {item.unit}</b><span>{item.name}{item.notes ? `, ${item.notes}` : ''}{item.optional ? ' (optional)' : ''}</span></div>)}</div>)}</section>
      <section><div className="section-kicker">How to make it</div><h3>Method</h3>{recipe.steps.map((step, i) => <div className="detail-step" key={`${step.text}-${i}`}><span>{String(i + 1).padStart(2, '0')}</span><div><p>{step.text}</p>{step.timer > 0 && <small>{step.timer} minute timer</small>}</div></div>)}</section></div>
  </Modal>
}

const blankIngredient = (section = 'Main') => ({ section, ingredientId: '', name: '', quantity: 1, unit: 'cup', notes: '', optional: false })
const blankRecipe = () => ({ title: '', description: '', sourceUrl: '', cuisine: 'American', mealType: 'Dinner', dietary: [], categories: [], servings: 4, prep: 15, cook: 30, spice: 2, accent: '#D56545', image: '', imageName: '', ingredients: [blankIngredient()], steps: [{ text: '', timer: 0 }], suggestions: true, includeShopping: true, nutrition: false, substitutions: true, measurement: 'US', addNow: false, planWeek: iso(mondayOf(new Date())), planDate: iso(new Date()), planTime: 'Dinner', exactTime: '18:30' })

function RecipeForm({ onClose, onSave }) {
  const [form, setForm] = useState(blankRecipe)
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const updateIngredient = (index, patch) => set('ingredients', form.ingredients.map((item, i) => i === index ? { ...item, ...patch } : item))
  const submit = (event) => { event.preventDefault(); if (!form.title.trim() || form.ingredients.some((i) => !i.name) || form.steps.some((s) => !s.text.trim())) return; onSave({ ...form, id: `local-${Date.now()}` }) }
  return <Modal onClose={onClose} wide><form onSubmit={submit} className="recipe-form"><header className="form-header"><div><div className="eyebrow">Personal cookbook</div><h2>Create a recipe</h2><p>Build it once. Keep it in the rotation.</p></div><button type="button" className="close" onClick={onClose}>Close</button></header>
    <div className="form-layout"><div className="form-main">
      <FormSection number="01" title="Recipe details"><div className="field-grid"><label className="span-2">Recipe title<input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Sunday tomato pasta" /></label><label className="span-2">Short description<textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What makes this one special?" /></label><label>Source link<input type="url" value={form.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} placeholder="https://" /></label><label>Cuisine<select value={form.cuisine} onChange={(e) => set('cuisine', e.target.value)}>{lookups.cuisines.map((x) => <option key={x.cuisine_id}>{x.cuisine_name}</option>)}</select></label><label>Primary meal<select value={form.mealType} onChange={(e) => set('mealType', e.target.value)}>{lookups.mealTypes.map((x) => <option key={x.meal_type_id}>{x.meal_type_name}</option>)}</select></label></div>
        <ChoiceGroup label="Dietary suitability" items={lookups.dietary.map((x) => x.dietary_tag_name)} selected={form.dietary} onChange={(value) => set('dietary', value)} /><ChoiceGroup label="Categories" items={lookups.categories.map((x) => x.category_name)} selected={form.categories} onChange={(value) => set('categories', value)} /></FormSection>
      <FormSection number="02" title="Timing & yield"><div className="timing-row"><label>Servings<div className="stepper"><button type="button" onClick={() => set('servings', Math.max(1, form.servings - 1))}>-</button><b>{form.servings}</b><button type="button" onClick={() => set('servings', form.servings + 1)}>+</button></div></label><label>Prep time (min)<input type="number" min="0" value={form.prep} onChange={(e) => set('prep', Number(e.target.value))} /></label><label>Cook time (min)<input type="number" min="0" value={form.cook} onChange={(e) => set('cook', Number(e.target.value))} /></label><div className="total-time"><small>Total</small><b>{form.prep + form.cook} min</b></div></div><label className="range-label">Spice level <b>{['Mild', 'Gentle', 'Medium', 'Hot', 'Very hot', 'Fiery'][form.spice]}</b><input type="range" min="0" max="5" value={form.spice} onChange={(e) => set('spice', Number(e.target.value))} /></label></FormSection>
      <FormSection number="03" title="Image & appearance"><div className="image-fields"><label className="upload">Cover image<input type="file" accept="image/*" onChange={(e) => set('imageName', e.target.files[0]?.name || '')} /><span>{form.imageName || 'Choose image file'}</span><small>Image bytes are not stored; placeholder is used after refresh.</small></label><label>Card accent<div className="colors">{['#D56545', '#79956A', '#D4A33E', '#566D8C', '#955E70'].map((color) => <button type="button" key={color} aria-label={color} className={form.accent === color ? 'selected' : ''} style={{ background: color }} onClick={() => set('accent', color)} />)}</div></label></div></FormSection>
      <FormSection number="04" title="Ingredients">{form.ingredients.map((item, index) => <div className="ingredient-row" key={index}><span className="drag">{index + 1}</span><label>Section<input value={item.section} onChange={(e) => updateIngredient(index, { section: e.target.value })} placeholder="Main" /></label><label className="ingredient-name">Ingredient<input required list="ingredient-list" value={item.name} onChange={(e) => { const found = lookups.ingredients.find((x) => x.ingredient_name === e.target.value); updateIngredient(index, { name: e.target.value, ingredientId: found?.ingredient_id || '' }) }} placeholder="Search ingredients" /></label><label>Qty<input required type="number" min="0" step="0.25" value={item.quantity} onChange={(e) => updateIngredient(index, { quantity: Number(e.target.value) })} /></label><label>Unit<select value={item.unit} onChange={(e) => updateIngredient(index, { unit: e.target.value })}>{lookups.units.map((x) => <option key={x.unit_id}>{x.unit_name}</option>)}</select></label><label className="check"><input type="checkbox" checked={item.optional} onChange={(e) => updateIngredient(index, { optional: e.target.checked })} /> Optional</label><div className="row-actions"><button type="button" disabled={index === 0} onClick={() => set('ingredients', move(form.ingredients, index, -1))}>↑</button><button type="button" disabled={index === form.ingredients.length - 1} onClick={() => set('ingredients', move(form.ingredients, index, 1))}>↓</button><button type="button" disabled={form.ingredients.length === 1} onClick={() => set('ingredients', form.ingredients.filter((_, i) => i !== index))}>×</button></div></div>)}<datalist id="ingredient-list">{lookups.ingredients.map((x) => <option key={x.ingredient_id} value={x.ingredient_name} />)}</datalist><div className="add-row"><button type="button" onClick={() => set('ingredients', [...form.ingredients, blankIngredient(form.ingredients.at(-1)?.section)])}>+ Add ingredient</button><button type="button" onClick={() => set('ingredients', [...form.ingredients, blankIngredient('New section')])}>+ Add section</button></div></FormSection>
      <FormSection number="05" title="Method">{form.steps.map((step, index) => <div className="method-row" key={index}><span>{String(index + 1).padStart(2, '0')}</span><textarea required value={step.text} onChange={(e) => set('steps', form.steps.map((s, i) => i === index ? { ...s, text: e.target.value } : s))} placeholder="Describe this cooking step..." /><label>Timer<input type="number" min="0" value={step.timer} onChange={(e) => set('steps', form.steps.map((s, i) => i === index ? { ...s, timer: Number(e.target.value) } : s))} /> min</label><div className="row-actions"><button type="button" disabled={index === 0} onClick={() => set('steps', move(form.steps, index, -1))}>↑</button><button type="button" disabled={index === form.steps.length - 1} onClick={() => set('steps', move(form.steps, index, 1))}>↓</button><button type="button" disabled={form.steps.length === 1} onClick={() => set('steps', form.steps.filter((_, i) => i !== index))}>×</button></div></div>)}<button type="button" className="add-dashed" onClick={() => set('steps', [...form.steps, { text: '', timer: 0 }])}>+ Add cooking step</button></FormSection>
      <FormSection number="06" title="Meal planning"><Toggle label="Available in meal-plan suggestions" checked={form.suggestions} onChange={(v) => set('suggestions', v)} /><Toggle label="Add this recipe to the meal plan now" checked={form.addNow} onChange={(v) => set('addNow', v)} />{form.addNow && <div className="field-grid planning-fields"><label>Planning week<input type="date" value={form.planWeek} onChange={(e) => set('planWeek', e.target.value)} /></label><label>Cooking date<input type="date" value={form.planDate} onChange={(e) => set('planDate', e.target.value)} /></label><label>Serving slot<select value={form.planTime} onChange={(e) => set('planTime', e.target.value)}>{mealSlots.map((x) => <option key={x}>{x}</option>)}</select></label><label>Specific time<input type="time" value={form.exactTime} onChange={(e) => set('exactTime', e.target.value)} /></label></div>}</FormSection>
    </div><aside className="options-panel"><div className="section-kicker">Recipe options</div><h3>Set your defaults</h3><Toggle label="Include in shopping lists" checked={form.includeShopping} onChange={(v) => set('includeShopping', v)} /><Toggle label="Show nutrition information" checked={form.nutrition} onChange={(v) => set('nutrition', v)} /><Toggle label="Allow substitutions" checked={form.substitutions} onChange={(v) => set('substitutions', v)} /><div className="measurement"><span>Measurements</span><div><button type="button" className={form.measurement === 'US' ? 'active' : ''} onClick={() => set('measurement', 'US')}>US customary</button><button type="button" className={form.measurement === 'Metric' ? 'active' : ''} onClick={() => set('measurement', 'Metric')}>Metric</button></div></div></aside></div>
    <footer className="form-footer"><span>Required: title, ingredients, and method.</span><div><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Save recipe</button></div></footer></form></Modal>
}

function FormSection({ number, title, children }) { return <section className="form-section"><header><span>{number}</span><h3>{title}</h3></header>{children}</section> }
function ChoiceGroup({ label, items, selected, onChange }) { return <fieldset className="choice-group"><legend>{label}</legend>{items.map((item) => <label key={item} className={selected.includes(item) ? 'active' : ''}><input type="checkbox" checked={selected.includes(item)} onChange={() => onChange(selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item])} />{item}</label>)}</fieldset> }

function Planner({ recipes, plans, setPlans, week, setWeek, onOpen }) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(week, i)); const [picker, setPicker] = useState(null)
  const assign = (recipeId) => { setPlans({ ...plans, [`${picker.date}|${picker.slot}`]: recipeId }); setPicker(null) }
  const weekLabel = `${prettyDate(days[0])} - ${prettyDate(days[6])}`
  return <div className="page planner-page"><header className="page-heading"><div><div className="eyebrow">Seven days, one clear view</div><h1>Weekly planner</h1><p>Choose a slot, then fill it with something worth looking forward to.</p></div><div className="week-switcher"><button onClick={() => setWeek(shiftDate(week, -7))}>←</button><b>{weekLabel}</b><button onClick={() => setWeek(shiftDate(week, 7))}>→</button></div></header>
    <div className="planner-grid">{days.map((date, dayIndex) => <section className={`day-column ${date === iso(new Date()) ? 'today' : ''}`} key={date}><header><span>{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))}</span><b>{new Date(`${date}T12:00:00`).getDate()}</b>{dayIndex === 0 && <small>Week starts</small>}</header>{mealSlots.map((slot) => { const key = `${date}|${slot}`; const recipe = recipes.find((r) => r.id === plans[key]); return <div className={`meal-slot ${recipe ? 'filled' : ''}`} key={slot}><span>{slot}</span>{recipe ? <><button className="planned-recipe" onClick={() => onOpen(recipe)}><img src={recipe.image || APPROVED_IMAGES.placeholder} alt="" /><b>{recipe.title}</b></button><div className="slot-actions"><button onClick={() => setPicker({ date, slot })}>Replace</button><button onClick={() => { const next = { ...plans }; delete next[key]; setPlans(next) }}>Remove</button></div></> : <button className="empty-slot" onClick={() => setPicker({ date, slot })}>+ Add recipe</button>}</div>})}</section>)}</div>
    {picker && <Modal onClose={() => setPicker(null)}><div className="picker-head"><div><div className="eyebrow">{prettyDate(picker.date)} / {picker.slot}</div><h2>Choose a recipe</h2></div><button className="close" onClick={() => setPicker(null)}>Close</button></div><div className="recipe-picker">{recipes.filter((r) => r.suggestions !== false).map((recipe) => <button key={recipe.id} onClick={() => assign(recipe.id)}><img src={recipe.image || APPROVED_IMAGES.placeholder} alt="" /><span><b>{recipe.title}</b><small>{recipe.cuisine} / {recipe.prep + recipe.cook} min</small></span></button>)}</div></Modal>}
  </div>
}

function Shopping({ recipes, plans, checked, setChecked, pantry, setPantry }) {
  const items = useMemo(() => { const totals = new Map(); Object.values(plans).forEach((id) => { const recipe = recipes.find((r) => r.id === id); if (!recipe?.includeShopping) return; recipe.ingredients.forEach((item) => { if (item.optional) return; const key = `${item.name}|${item.unit}`.toLowerCase(); const source = lookups.ingredients.find((x) => x.ingredient_id === item.ingredientId || x.ingredient_name.toLowerCase() === item.name.toLowerCase()); const existing = totals.get(key); totals.set(key, { key, name: item.name, unit: item.unit, quantity: (existing?.quantity || 0) + Number(item.quantity || 0), category: source?.shopping_category || 'Grains & pantry' }) }) }); return [...totals.values()] }, [plans, recipes])
  const visible = items.filter((item) => !pantry.includes(item.key)); const remaining = visible.filter((item) => !checked[item.key]).length
  return <div className="page shopping-page"><header className="page-heading"><div><div className="eyebrow">Synced with your meal plan</div><h1>Shopping list</h1><p>Repeated ingredients are combined automatically. Check things off as you go.</p></div><div className="shopping-count"><b>{remaining}</b><span>items left</span></div></header>
    {!items.length ? <div className="empty-state"><span>+</span><h2>Your list is waiting</h2><p>Add recipes to the weekly planner and their ingredients will appear here.</p></div> : <div className="shopping-layout"><main>{categoryOrder.map((category) => { const group = visible.filter((item) => item.category === category); if (!group.length) return null; return <section className="shopping-group" key={category}><header><h2>{category}</h2><span>{group.length}</span></header>{group.map((item) => <div className={`shopping-item ${checked[item.key] ? 'checked' : ''}`} key={item.key}><label><input type="checkbox" checked={!!checked[item.key]} onChange={(e) => setChecked({ ...checked, [item.key]: e.target.checked })} /><span className="custom-check">✓</span><b>{item.name}</b></label><span>{Number(item.quantity.toFixed(2))} {item.unit}</span><button onClick={() => setPantry([...pantry, item.key])}>I have this</button></div>)}</section>})}</main><aside className="pantry-card"><div className="section-kicker">Pantry</div><h3>Already on hand</h3><p>Excluded items stay here until you add them back.</p>{pantry.map((key) => { const item = items.find((x) => x.key === key); return item ? <button key={key} onClick={() => setPantry(pantry.filter((x) => x !== key))}><span>{item.name}</span> + Add back</button> : null })}{!pantry.length && <small>No excluded items yet.</small>}</aside></div>}
  </div>
}

export default function App() {
  const [view, setView] = useState('recipes'); const [query, setQuery] = useState(''); const [selected, setSelected] = useState(null); const [showForm, setShowForm] = useState(false)
  const [customRecipes, setCustomRecipes] = useState(() => load('mise-recipes', [])); const [plans, setPlans] = useState(() => load('mise-plans', {})); const [checked, setChecked] = useState(() => load('mise-checked', {})); const [pantry, setPantry] = useState(() => load('mise-pantry', [])); const [week, setWeek] = useState(iso(mondayOf(new Date())))
  const recipes = [...seedRecipes, ...customRecipes]
  useEffect(() => localStorage.setItem('mise-recipes', JSON.stringify(customRecipes)), [customRecipes]); useEffect(() => localStorage.setItem('mise-plans', JSON.stringify(plans)), [plans]); useEffect(() => localStorage.setItem('mise-checked', JSON.stringify(checked)), [checked]); useEffect(() => localStorage.setItem('mise-pantry', JSON.stringify(pantry)), [pantry])
  const openPlanner = (recipe) => { setSelected(null); setView('planner'); setTimeout(() => document.querySelector('.empty-slot')?.focus(), 0); if (recipe) sessionStorage.setItem('mise-plan-recipe', recipe.id) }
  const saveRecipe = (recipe) => { const clean = { ...recipe, image: '' }; setCustomRecipes([...customRecipes, clean]); if (recipe.addNow) setPlans({ ...plans, [`${recipe.planDate}|${recipe.planTime}`]: recipe.id }); setShowForm(false); setView(recipe.addNow ? 'planner' : 'recipes') }
  const filtered = recipes.filter((recipe) => [recipe.title, recipe.cuisine, recipe.mealType, ...recipe.categories].join(' ').toLowerCase().includes(query.toLowerCase()))
  return <div className="app-shell"><header className="topbar"><button className="brand" onClick={() => setView('recipes')}><span>m</span><b>mise</b></button><nav>{[['recipes', 'Recipes'], ['planner', 'Planner'], ['shopping', 'Shopping list']].map(([id, label]) => <button className={view === id ? 'active' : ''} key={id} onClick={() => setView(id)}>{label}{id === 'shopping' && Object.keys(plans).length > 0 && <span>{Object.keys(plans).length}</span>}</button>)}</nav><button className="new-recipe" onClick={() => setShowForm(true)}>+ New recipe</button></header>
    {view === 'recipes' && <div className="page catalog"><header className="catalog-hero"><div><div className="eyebrow">Your personal cookbook</div><h1>Recipes for real life.</h1><p>Keep the dishes you love close, and turn them into a plan.</p></div><div className="hero-number"><b>{String(recipes.length).padStart(2, '0')}</b><span>recipes saved</span></div></header><div className="catalog-tools"><label><span>Search</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes, cuisines, categories..." /></label><span>{filtered.length} {filtered.length === 1 ? 'recipe' : 'recipes'}</span></div><div className="recipe-grid">{filtered.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onOpen={() => setSelected(recipe)} onPlan={() => openPlanner(recipe)} />)}<button className="add-card" onClick={() => setShowForm(true)}><span>+</span><b>Add your own recipe</b><small>Make this collection yours</small></button></div></div>}
    {view === 'planner' && <Planner recipes={recipes} plans={plans} setPlans={setPlans} week={week} setWeek={setWeek} onOpen={setSelected} />}
    {view === 'shopping' && <Shopping recipes={recipes} plans={plans} checked={checked} setChecked={setChecked} pantry={pantry} setPantry={setPantry} />}
    {selected && <RecipeDetail recipe={selected} onClose={() => setSelected(null)} onPlan={() => openPlanner(selected)} />}{showForm && <RecipeForm onClose={() => setShowForm(false)} onSave={saveRecipe} />}
  </div>
}
