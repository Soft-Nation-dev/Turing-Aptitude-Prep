const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const COUNT = 18;
const CATEGORIES = ["analytical", "english", "detail"];
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });
export default {
 async fetch(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "*";
  const cors = {"Access-Control-Allow-Origin": allowed === "*" ? "*" : allowed, "Access-Control-Allow-Methods":"POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type", "Vary":"Origin", "Content-Type":"application/json"};
  if (request.method === "OPTIONS") return new Response(null,{headers:cors});
  if (allowed !== "*" && origin && origin !== allowed) return json({error:"Origin not allowed."},403,cors);
  const path = new URL(request.url).pathname;
  if (request.method !== "POST" || !["/api/generate","/api/grade"].includes(path)) return json({error:"Not found."},404,cors);
  try { return path === "/api/generate" ? await generate(request,env,cors) : await grade(request,env,cors); }
  catch(e) { return json({error:e?.message || "Unexpected server error."},500,cors); }
 }
};
async function generate(request,env,cors) {
 if (!env.AI || !env.QUIZ_STORE) return json({error:"Cloudflare AI and KV are not configured. Follow the deployment instructions."},503,cors);
 const body=await request.json();
 const difficulty=["easy","intermediate","advanced","mixed"].includes(body.difficulty)?body.difficulty:"mixed";
 const prompt = `You are creating a rigorous practice assessment to prepare a candidate for the Turing General Aptitude Test. This is original practice material, NOT actual, leaked, or guaranteed Turing questions. The candidate's assessment instructions specify 18 multiple-choice questions, 60 minutes, one correct answer per question, and assessment objectives of analytical reasoning, English proficiency, and attention to detail.
Create exactly 18 questions: exactly 6 analytical, 6 english, and 6 detail. Difficulty: ${difficulty}. If mixed, include a meaningful spread of easy, intermediate, and advanced questions.
ANALYTICAL: numerical reasoning, arithmetic word problems, ratios, percentages, number patterns, logical deductions, sequences, and interpreting simple data. Test reasoning, not obscure trivia.
ENGLISH: grammar, punctuation, vocabulary in context, sentence correction, concise reading comprehension, inference, and word usage. Use natural professional English.
DETAIL: careful comparison of similar strings, names, dates, numbers, instructions, short records, spotting inconsistencies, and exact matching. Include all data needed in each question; avoid relying on visual formatting.
Each item must have exactly four distinct options A-D and exactly one defensibly correct answer. No ambiguous wording, missing information, duplicate questions, or multiple valid answers. Verify calculations, answer key, and explanation. Make questions appropriately challenging for a timed professional screening test, not childish riddles. Use concise wording.
Return ONLY JSON: {"questions":[{"id":"q1","category":"analytical|english|detail","difficulty":"easy|intermediate|advanced","question":"...","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correctOptionId":"A","explanation":"..."}]}. IDs must run q1 to q18. Exactly 6 of each category.`;
 const result=await env.AI.run(MODEL,{messages:[{role:"system",content:"You are an assessment author. Return valid JSON only. Follow the schema and verify each answer."},{role:"user",content:prompt}],response_format:{type:"json_object"},max_tokens:7500,temperature:0.65});
 const raw=typeof result==="string"?result:(result.response||result.choices?.[0]?.message?.content||"");
 let parsed;try{parsed=JSON.parse(raw)}catch{return json({error:"The AI did not return valid question data. Please try again."},502,cors)}
 const qs=parsed.questions;
 if(!Array.isArray(qs)||qs.length!==COUNT||!qs.every(validQuestion)||CATEGORIES.some(c=>qs.filter(q=>q.category===c).length!==6)) return json({error:"The generated questions did not pass quality checks. Please try again."},502,cors);
 const testId=crypto.randomUUID();
 await env.QUIZ_STORE.put(testId,JSON.stringify(qs),{expirationTtl:7200});
 return json({testId,questions:qs.map(({id,category,difficulty,question,options})=>({id,category,difficulty,question,options}))},200,cors);
}
function validQuestion(q,i){return q&&q.id==="q"+(i+1)&&CATEGORIES.includes(q.category)&&["easy","intermediate","advanced"].includes(q.difficulty)&&typeof q.question==="string"&&q.question.length>12&&Array.isArray(q.options)&&q.options.length===4&&q.options.every((o,j)=>o&&o.id===["A","B","C","D"][j]&&typeof o.text==="string"&&o.text.length>0)&&["A","B","C","D"].includes(q.correctOptionId)&&typeof q.explanation==="string"&&q.explanation.length>8}
async function grade(request,env,cors){
 if(!env.QUIZ_STORE)return json({error:"Question storage is not configured."},503,cors);
 const {testId,answers}=await request.json();
 if(typeof testId!=="string"||!answers||typeof answers!=="object")return json({error:"Invalid submission."},400,cors);
 const raw=await env.QUIZ_STORE.get(testId);if(!raw)return json({error:"This test has expired or was already submitted. Generate a new test."},404,cors);
 const qs=JSON.parse(raw);let score=0,answered=0;const byCategory={analytical:{correct:0,total:0},english:{correct:0,total:0},detail:{correct:0,total:0}};
 const review=qs.map(q=>{const chosen=q.options.find(o=>o.id===answers[q.id]);const right=q.options.find(o=>o.id===q.correctOptionId);const correct=answers[q.id]===q.correctOptionId;if(chosen)answered++;byCategory[q.category].total++;if(correct){score++;byCategory[q.category].correct++}return{question:q.question,correct,selectedText:chosen?.text||null,correctText:right.text,explanation:q.explanation}});
 await env.QUIZ_STORE.delete(testId);
 return json({score,answered,byCategory,review},200,cors);
}