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
    const c = text[i], next = text[i + 1]
    if (c === '"' && quoted && next === '"') { cell += '"'; i += 1 }
    else if (c === '"') quoted = !quoted
    else if (c === ',' && !quoted) { row.push(cell); cell = '' }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const headers = rows.shift()
  return rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])))
}

const recipesRaw = parseCsv(recipesCsv)
const ingredientLookup = parseCsv(ingredientsCsv)
const recipeIngredients = parseCsv(recipeIngredientsCsv)
const recipeSteps = parseCsv(stepsCsv)
const cuisines = parseCsv(cuisinesCsv)
const mealTypes = parseCsv(mealTypesCsv)
const dietaryTags = parseCsv(dietaryCsv)
const categories = parseCsv(categoriesCsv)
const units = parseCsv(unitsCsv)
const byId = (list, idKey, nameKey, id) => list.find((x) => x[idKey] === id)?.[nameKey] || id
const seedRecipes = recipesRaw.map((r) => ({
  ...r, id: r.recipe_id, prep: +r.prep_time_minutes, cook: +r.cook_time_minutes, servings: +r.servings,
  cuisine: byId(cuisines, 'cuisine_id', 'cuisine_name', r.cuisine_id),
  mealType: byId(mealTypes, 'meal_type_id', 'meal_type_name', r.meal_type_id),
  dietary: r.dietary_tag_ids.split(',').filter(Boolean).map((id) => byId(dietaryTags, 'dietary_tag_id', 'dietary_tag_name', id)),
  categories: r.category_ids.split(',').filter(Boolean).map((id) => byId(categories, 'category_id', 'category_name', id)),
  image: r.cover_image_url, accent: r.accent_color, includeShopping: true,
  ingredients: recipeIngredients.filter((i) => i.recipe_id === r.recipe_id).map((i) => ({ ...i, id: i.ingredient_id, name: i.ingredient_name, optional: i.optional.toLowerCase() === 'true' })),
  steps: recipeSteps.filter((s) => s.recipe_id === r.recipe_id).map((s) => ({ text: s.instruction, timer: +s.timer_minutes }))
}))
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value))
const weekStart = (date = new Date()) => { const d = new Date(date); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); d.setHours(12, 0, 0, 0); return d }
const iso = (d) => d.toISOString().slice(0, 10)
const dayLabel = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const emptyIngredient = () => ({ section_name: 'Main', id: 'ING013', name: 'Garlic', quantity: 1, unit: 'clove', optional: false })
const initialForm = () => ({ title: '', source_url: '', short_description: '', cuisine: 'Italian', mealType: 'Dinner', dietary: [], categories: [], servings: 4, prep: 15, cook: 30, spice: 1, accent: '#C5673E', imageName: '', ingredients: [emptyIngredient()], steps: [{ text: '', timer: 0 }], suggestions: true, addNow: false, planDate: iso(new Date()), planSlot: 'Dinner', planTime: '18:30', includeShopping: true, nutrition: false, substitutions: true, measurement: 'US' })

const Icon = ({ name }) => <span className="icon" aria-hidden="true">{{ book: '▤', plan: '▦', cart: '✓', plus: '+', clock: '◷', people: '♙', flame: '♨', arrow: '→', close: '×', dots: '•••' }[name]}</span>

export default function App() {
  const [tab, setTab] = useState('recipes')
  const [userRecipes, setUserRecipes] = useState(() => load('mise-recipes', []))
  const [plans, setPlans] = useState(() => load('mise-plans', {}))
  const [checked, setChecked] = useState(() => load('mise-checked', {}))
  const [pantry, setPantry] = useState(() => load('mise-pantry', {}))
  const [week, setWeek] = useState(() => weekStart())
  const [detail, setDetail] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [slotEditor, setSlotEditor] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All meals')
  const [form, setForm] = useState(initialForm)
  const recipes = [...seedRecipes, ...userRecipes]
  useEffect(() => save('mise-recipes', userRecipes), [userRecipes])
  useEffect(() => save('mise-plans', plans), [plans])
  useEffect(() => save('mise-checked', checked), [checked])
  useEffect(() => save('mise-pantry', pantry), [pantry])

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return d })
  const currentPlanIds = days.flatMap((d) => ['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((s) => plans[`${iso(d)}-${s}`]).filter(Boolean))
  const shopping = useMemo(() => {
    const merged = new Map()
    currentPlanIds.forEach((id) => {
      const recipe = recipes.find((r) => r.id === id)
      if (!recipe?.includeShopping) return
      recipe.ingredients.filter((i) => !i.optional).forEach((i) => {
        const key = `${i.id || i.name}-${i.unit}`
        const lookup = ingredientLookup.find((x) => x.ingredient_id === i.id)
        const item = merged.get(key) || { ...i, quantity: 0, category: lookup?.shopping_category || 'Grains & pantry' }
        item.quantity += Number(i.quantity) || 0; merged.set(key, item)
      })
    })
    return [...merged.values()]
  }, [currentPlanIds.join('|'), userRecipes])

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const toggleArray = (key, value) => setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }))
  const updateList = (key, index, patch) => setForm((f) => ({ ...f, [key]: f[key].map((x, i) => i === index ? { ...x, ...patch } : x) }))
  const move = (key, index, delta) => setForm((f) => { const list = [...f[key]], target = index + delta; if (target < 0 || target >= list.length) return f; [list[index], list[target]] = [list[target], list[index]]; return { ...f, [key]: list } })
  const createRecipe = (e) => {
    e.preventDefault(); if (!form.title.trim()) return
    const recipe = { ...form, id: `USR-${Date.now()}`, total_time_minutes: form.prep + form.cook, cover_image_url: '', image: APPROVED_IMAGES.placeholder }
    setUserRecipes((r) => [...r, recipe])
    if (form.addNow) setPlans((p) => ({ ...p, [`${form.planDate}-${form.planSlot}`]: recipe.id }))
    setForm(initialForm()); setShowForm(false); setTab('recipes'); setDetail(recipe)
  }
  const assign = (recipeId) => { setPlans((p) => ({ ...p, [slotEditor]: recipeId })); setSlotEditor(null) }
  const filtered = recipes.filter((r) => (filter === 'All meals' || r.mealType === filter) && `${r.title} ${r.cuisine}`.toLowerCase().includes(query.toLowerCase()))

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => { setTab('recipes'); setDetail(null) }}><span className="brand-mark">M</span><span>Mise</span></button>
      <nav aria-label="Primary navigation">
        <button className={tab === 'recipes' ? 'active' : ''} onClick={() => { setTab('recipes'); setDetail(null) }}><Icon name="book"/>Recipes</button>
        <button className={tab === 'planner' ? 'active' : ''} onClick={() => setTab('planner')}><Icon name="plan"/>Meal planner</button>
        <button className={tab === 'shopping' ? 'active' : ''} onClick={() => setTab('shopping')}><Icon name="cart"/>Shopping list{shopping.length > 0 && <b>{shopping.length}</b>}</button>
      </nav>
      <button className="primary compact" onClick={() => setShowForm(true)}><Icon name="plus"/> New recipe</button>
    </header>

    <main>
      {tab === 'recipes' && !detail && <RecipeCatalog recipes={filtered} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} setDetail={setDetail} setShowForm={setShowForm} />}
      {tab === 'recipes' && detail && <RecipeDetail recipe={detail} onBack={() => setDetail(null)} onPlan={() => { setDetail(null); setTab('planner') }} />}
      {tab === 'planner' && <Planner days={days} week={week} setWeek={setWeek} plans={plans} recipes={recipes} setSlotEditor={setSlotEditor} />}
      {tab === 'shopping' && <ShoppingList shopping={shopping} checked={checked} setChecked={setChecked} pantry={pantry} setPantry={setPantry} plannedCount={currentPlanIds.length} />}
    </main>
    {showForm && <RecipeForm form={form} setField={setField} toggleArray={toggleArray} updateList={updateList} move={move} onClose={() => setShowForm(false)} onSubmit={createRecipe} />}
    {slotEditor && <SlotDialog slot={slotEditor} recipes={recipes} current={plans[slotEditor]} assign={assign} remove={() => { setPlans((p) => { const n = { ...p }; delete n[slotEditor]; return n }); setSlotEditor(null) }} close={() => setSlotEditor(null)} />}
  </div>
}

function RecipeCatalog({ recipes, query, setQuery, filter, setFilter, setDetail, setShowForm }) {
  return <div className="page"><div className="hero-row"><div><p className="eyebrow">Your kitchen library</p><h1>Recipes worth returning to.</h1><p className="lede">Build your collection, plan the week, and let the list write itself.</p></div><div className="count"><strong>{recipes.length}</strong><span>recipes</span></div></div>
    <div className="toolbar"><label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes or cuisines..." /></label><div className="filter-tabs">{['All meals', 'Breakfast', 'Lunch', 'Dinner', 'Snack'].map((x) => <button key={x} className={filter === x ? 'active' : ''} onClick={() => setFilter(x)}>{x}</button>)}</div></div>
    <section className="recipe-grid">{recipes.map((r, i) => <article className="recipe-card" key={r.id} onClick={() => setDetail(r)} style={{ '--accent': r.accent }}>
      <div className="card-image"><img src={r.image || APPROVED_IMAGES.placeholder} alt="" onError={(e) => { e.currentTarget.src = APPROVED_IMAGES.placeholder }} /><span className="meal-pill">{r.mealType}</span><button className="more" aria-label={`Options for ${r.title}`} onClick={(e) => e.stopPropagation()}><Icon name="dots"/></button></div>
      <div className="card-body"><div className="meta"><span>{r.cuisine}</span><span>•</span><span>{r.categories?.[0] || 'Homemade'}</span></div><h2>{r.title}</h2><p>{r.short_description || 'A delicious recipe for your weekly rotation.'}</p><div className="card-foot"><span><Icon name="clock"/>{r.prep + r.cook} min</span><span><Icon name="people"/>{r.servings} servings</span><span className="card-arrow"><Icon name="arrow"/></span></div></div>
    </article>)}
    <button className="add-card" onClick={() => setShowForm(true)}><span><Icon name="plus"/></span><strong>Add your own recipe</strong><small>Start from scratch</small></button></section>
  </div>
}

function RecipeDetail({ recipe: r, onBack, onPlan }) {
  const sections = [...new Set(r.ingredients.map((i) => i.section_name))]
  return <div className="detail-page"><button className="back" onClick={onBack}>← All recipes</button><div className="detail-hero"><img src={r.image || APPROVED_IMAGES.placeholder} alt=""/><div className="detail-title" style={{ '--accent': r.accent }}><p className="eyebrow">{r.cuisine} · {r.mealType}</p><h1>{r.title}</h1><p>{r.short_description}</p><div className="detail-stats"><span><small>Prep</small><b>{r.prep} min</b></span><span><small>Cook</small><b>{r.cook} min</b></span><span><small>Serves</small><b>{r.servings}</b></span><span><small>Spice</small><b>{'●'.repeat(Math.max(1, +(r.spice || r.spice_level_0_to_5 || 1)))}</b></span></div><button className="primary" onClick={onPlan}>Add to meal plan</button></div></div>
    <div className="detail-content"><section><p className="section-kicker">What you'll need</p><h2>Ingredients</h2>{sections.map((s) => <div key={s} className="ingredient-section"><h3>{s}</h3>{r.ingredients.filter((i) => i.section_name === s).map((i, x) => <div className="ingredient-line" key={x}><span>{i.name}{i.optional && <em> optional</em>}</span><b>{i.quantity} {i.unit}</b></div>)}</div>)}</section><section><p className="section-kicker">Step by step</p><h2>Method</h2><ol className="method">{r.steps.map((s, i) => <li key={i}><span>{i + 1}</span><div><p>{s.text}</p>{s.timer > 0 && <small><Icon name="clock"/>{s.timer} minutes</small>}</div></li>)}</ol></section></div>
  </div>
}

function Planner({ days, week, setWeek, plans, recipes, setSlotEditor }) {
  const shift = (n) => { const d = new Date(week); d.setDate(d.getDate() + n); setWeek(d) }
  return <div className="page wide"><div className="page-head"><div><p className="eyebrow">Seven days, sorted</p><h1>Weekly meal plan</h1><p className="lede">A little planning now, a calmer kitchen later.</p></div><div className="week-nav"><button onClick={() => shift(-7)} aria-label="Previous week">←</button><strong>{days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong><button onClick={() => shift(7)} aria-label="Next week">→</button></div></div>
    <div className="planner-grid">{days.map((day) => <section className={iso(day) === iso(new Date()) ? 'today' : ''} key={iso(day)}><header><span>{day.toLocaleDateString('en-US', { weekday: 'short' })}</span><b>{day.getDate()}</b></header>{['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((slot) => { const key = `${iso(day)}-${slot}`, recipe = recipes.find((r) => r.id === plans[key]); return <button key={slot} className={`meal-slot ${recipe ? 'filled' : ''}`} onClick={() => setSlotEditor(key)}><small>{slot}</small>{recipe ? <><img src={recipe.image || APPROVED_IMAGES.placeholder} alt=""/><strong>{recipe.title}</strong><span>{recipe.prep + recipe.cook} min · {recipe.cuisine}</span></> : <><i>+</i><span>Add recipe</span></>}</button>})}</section>)}</div>
  </div>
}

function ShoppingList({ shopping, checked, setChecked, pantry, setPantry, plannedCount }) {
  const groups = [...new Set(shopping.map((i) => i.category))]
  const visible = shopping.filter((i) => !pantry[i.id || i.name])
  return <div className="page shopping-page"><div className="page-head"><div><p className="eyebrow">From plan to pantry</p><h1>Shopping list</h1><p className="lede">Generated from {plannedCount} planned meal{plannedCount === 1 ? '' : 's'} this week.</p></div><div className="progress-ring"><strong>{visible.filter((i) => checked[i.id || i.name]).length}/{visible.length}</strong><span>collected</span></div></div>
    {shopping.length === 0 ? <div className="empty"><span>✓</span><h2>Your list is clear</h2><p>Add recipes to this week's meal plan and ingredients will gather here.</p></div> : <div className="shopping-layout"><div>{groups.map((g) => <section className="shopping-group" key={g}><h2>{g}<span>{shopping.filter((i) => i.category === g && !pantry[i.id || i.name]).length}</span></h2>{shopping.filter((i) => i.category === g && !pantry[i.id || i.name]).map((i) => { const key = i.id || i.name; return <label className={checked[key] ? 'checked' : ''} key={`${key}-${i.unit}`}><input type="checkbox" checked={!!checked[key]} onChange={() => setChecked((c) => ({ ...c, [key]: !c[key] }))}/><span className="checkmark">✓</span><strong>{i.name}</strong><em>{i.quantity % 1 ? i.quantity.toFixed(1) : i.quantity} {i.unit}</em><button type="button" onClick={(e) => { e.preventDefault(); setPantry((p) => ({ ...p, [key]: true })) }}>I have this</button></label>})}</section>)}</div><aside className="pantry-box"><p className="section-kicker">Pantry</p><h2>Already on hand</h2><p>These items are hidden from your active list.</p>{Object.keys(pantry).filter((k) => pantry[k]).map((k) => <button key={k} onClick={() => setPantry((p) => ({ ...p, [k]: false }))}>{ingredientLookup.find((i) => i.ingredient_id === k)?.ingredient_name || k}<span>×</span></button>)}{!Object.values(pantry).some(Boolean) && <small>Mark an item “I have this” to move it here.</small>}</aside></div>}
  </div>
}

function RecipeForm({ form, setField, toggleArray, updateList, move, onClose, onSubmit }) {
  const remove = (key, index) => setField(key, form[key].filter((_, i) => i !== index))
  return <div className="modal-backdrop"><div className="form-modal" role="dialog" aria-modal="true" aria-labelledby="new-recipe-title"><header><div><p className="eyebrow">Add to your collection</p><h1 id="new-recipe-title">Create a recipe</h1></div><button className="close" onClick={onClose}><Icon name="close"/><span className="sr-only">Close</span></button></header><form onSubmit={onSubmit}>
    <FormSection number="01" title="Recipe details"><div className="fields"><label className="span-2">Recipe title<input required value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="e.g. Lemon herb roast chicken"/></label><label className="span-2">Short description<textarea value={form.short_description} onChange={(e) => setField('short_description', e.target.value)} placeholder="What makes this recipe special?"/></label><label>Source link<input type="url" value={form.source_url} onChange={(e) => setField('source_url', e.target.value)} placeholder="https://"/></label><label>Cuisine<select value={form.cuisine} onChange={(e) => setField('cuisine', e.target.value)}>{cuisines.map((x) => <option key={x.cuisine_id}>{x.cuisine_name}</option>)}</select></label><label>Primary meal type<select value={form.mealType} onChange={(e) => setField('mealType', e.target.value)}>{mealTypes.map((x) => <option key={x.meal_type_id}>{x.meal_type_name}</option>)}</select></label></div><ChoiceSet label="Dietary suitability" values={dietaryTags.map((x) => x.dietary_tag_name)} selected={form.dietary} toggle={(x) => toggleArray('dietary', x)}/><ChoiceSet label="Recipe categories" values={categories.map((x) => x.category_name)} selected={form.categories} toggle={(x) => toggleArray('categories', x)}/></FormSection>
    <FormSection number="02" title="Timing & yield"><div className="fields four"><label>Servings<input type="number" min="1" value={form.servings} onChange={(e) => setField('servings', +e.target.value)}/></label><label>Prep time <small>min</small><input type="number" min="0" value={form.prep} onChange={(e) => setField('prep', +e.target.value)}/></label><label>Cook time <small>min</small><input type="number" min="0" value={form.cook} onChange={(e) => setField('cook', +e.target.value)}/></label><label>Total time <small>min</small><input readOnly value={form.prep + form.cook}/></label></div><label className="range-label">Spice level <strong>{['No heat', 'Mild', 'Medium', 'Hot', 'Very hot', 'Fiery'][form.spice]}</strong><input type="range" min="0" max="5" value={form.spice} onChange={(e) => setField('spice', +e.target.value)}/></label></FormSection>
    <FormSection number="03" title="Image & appearance"><div className="image-options"><label className="upload"><input type="file" accept="image/*" onChange={(e) => setField('imageName', e.target.files[0]?.name || '')}/><span>↑</span><strong>{form.imageName || 'Choose cover image'}</strong><small>Your file stays on this device</small></label><div><label>Recipe card accent</label><div className="swatches">{['#C5673E','#56725C','#345B70','#8A6541','#7B5268','#B2933E'].map((c) => <button type="button" aria-label={`Select ${c}`} className={form.accent === c ? 'selected' : ''} style={{ background: c }} key={c} onClick={() => setField('accent', c)}/>)}</div></div></div></FormSection>
    <FormSection number="04" title="Ingredients"><div className="ingredient-editor">{form.ingredients.map((ing, i) => <div className="ingredient-row" key={i}><button type="button" className="drag" onClick={() => move('ingredients', i, i === 0 ? 1 : -1)} title="Reorder">↕</button><label>Section<input value={ing.section_name} onChange={(e) => updateList('ingredients', i, { section_name: e.target.value })}/></label><label className="grow">Ingredient<select value={ing.id} onChange={(e) => { const x = ingredientLookup.find((v) => v.ingredient_id === e.target.value); updateList('ingredients', i, { id: x.ingredient_id, name: x.ingredient_name }) }}>{ingredientLookup.map((x) => <option value={x.ingredient_id} key={x.ingredient_id}>{x.ingredient_name}</option>)}</select></label><label>Qty<input type="number" step="0.25" min="0" value={ing.quantity} onChange={(e) => updateList('ingredients', i, { quantity: +e.target.value })}/></label><label>Unit<select value={ing.unit} onChange={(e) => updateList('ingredients', i, { unit: e.target.value })}>{units.map((x) => <option key={x.unit_id}>{x.unit_name}</option>)}</select></label><label className="optional"><input type="checkbox" checked={ing.optional} onChange={(e) => updateList('ingredients', i, { optional: e.target.checked })}/>Optional</label><button type="button" className="remove" onClick={() => remove('ingredients', i)}>×</button></div>)}</div><div className="add-actions"><button type="button" onClick={() => setField('ingredients', [...form.ingredients, { ...emptyIngredient(), section_name: form.ingredients.at(-1)?.section_name || 'Main' }])}>+ Add ingredient</button><button type="button" onClick={() => setField('ingredients', [...form.ingredients, { ...emptyIngredient(), section_name: 'New section' }])}>+ Add section</button></div></FormSection>
    <FormSection number="05" title="Method"><div className="steps-editor">{form.steps.map((step, i) => <div className="step-row" key={i}><span>{i + 1}</span><textarea required value={step.text} onChange={(e) => updateList('steps', i, { text: e.target.value })} placeholder="Describe this step..."/><label><Icon name="clock"/><input type="number" min="0" value={step.timer} onChange={(e) => updateList('steps', i, { timer: +e.target.value })}/> min</label><button type="button" onClick={() => move('steps', i, i === 0 ? 1 : -1)}>↕</button><button type="button" onClick={() => remove('steps', i)}>×</button></div>)}</div><button type="button" className="text-button" onClick={() => setField('steps', [...form.steps, { text: '', timer: 0 }])}>+ Add step</button></FormSection>
    <FormSection number="06" title="Meal planning"><div className="toggle-list"><Toggle label="Available in meal-plan suggestions" checked={form.suggestions} onChange={(v) => setField('suggestions', v)}/><Toggle label="Add to meal plan when saved" checked={form.addNow} onChange={(v) => setField('addNow', v)}/></div>{form.addNow && <div className="fields three"><label>Planning week<input type="week" value={`${form.planDate.slice(0,4)}-W${String(Math.ceil((((new Date(form.planDate)-new Date(form.planDate.slice(0,4),0,1))/86400000)+new Date(form.planDate.slice(0,4),0,1).getDay()+1)/7)).padStart(2,'0')}`} readOnly/></label><label>Cooking date<input type="date" value={form.planDate} onChange={(e) => setField('planDate', e.target.value)}/></label><label>Meal slot<select value={form.planSlot} onChange={(e) => setField('planSlot', e.target.value)}>{['Breakfast','Lunch','Dinner','Snack'].map((x) => <option key={x}>{x}</option>)}</select></label><label>Serving time<input type="time" value={form.planTime} onChange={(e) => setField('planTime', e.target.value)}/></label></div>}</FormSection>
    <FormSection number="07" title="Recipe options"><div className="options-menu"><Toggle label="Include ingredients in shopping lists" checked={form.includeShopping} onChange={(v) => setField('includeShopping', v)}/><Toggle label="Show nutrition information" checked={form.nutrition} onChange={(v) => setField('nutrition', v)}/><Toggle label="Allow ingredient substitutions" checked={form.substitutions} onChange={(v) => setField('substitutions', v)}/><div className="measurement"><span>Measurements</span><div><button type="button" className={form.measurement === 'US' ? 'active' : ''} onClick={() => setField('measurement','US')}>US customary</button><button type="button" className={form.measurement === 'Metric' ? 'active' : ''} onClick={() => setField('measurement','Metric')}>Metric</button></div></div></div></FormSection>
    <footer><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" type="submit">Save recipe <Icon name="arrow"/></button></footer></form></div></div>
}

function FormSection({ number, title, children }) { return <section className="form-section"><div className="form-section-title"><span>{number}</span><h2>{title}</h2></div><div>{children}</div></section> }
function ChoiceSet({ label, values, selected, toggle }) { return <fieldset className="choice-set"><legend>{label}</legend>{values.map((x) => <label className={selected.includes(x) ? 'selected' : ''} key={x}><input type="checkbox" checked={selected.includes(x)} onChange={() => toggle(x)}/>{x}</label>)}</fieldset> }
function Toggle({ label, checked, onChange }) { return <label className="toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}/><i/></label> }
function SlotDialog({ slot, recipes, current, assign, remove, close }) { const [q, setQ] = useState(''); const [date, meal] = [slot.slice(0,10), slot.slice(11)]; return <div className="modal-backdrop"><div className="slot-dialog" role="dialog" aria-modal="true"><header><div><p className="eyebrow">{new Date(`${date}T12:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</p><h2>Choose {meal.toLowerCase()}</h2></div><button className="close" onClick={close}>×</button></header><label className="search"><span>⌕</span><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes..."/></label><div className="slot-recipes">{recipes.filter((r) => r.title.toLowerCase().includes(q.toLowerCase())).map((r) => <button key={r.id} onClick={() => assign(r.id)} className={current === r.id ? 'selected' : ''}><img src={r.image || APPROVED_IMAGES.placeholder} alt=""/><span><strong>{r.title}</strong><small>{r.cuisine} · {r.prep + r.cook} min</small></span><b>{current === r.id ? '✓' : '+'}</b></button>)}</div>{current && <button className="remove-plan" onClick={remove}>Remove from plan</button>}</div></div> }
