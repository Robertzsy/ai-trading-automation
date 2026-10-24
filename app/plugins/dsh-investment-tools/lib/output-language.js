/** Per-request conversation language; workflow children use their frozen run contract. */
export function installConversationLanguage(ctx) {
  if (typeof ctx.on !== 'function') return;
  ctx.on('agent/created', ({agent}) => {
    if (agent.session?.header?.origin === 'subagent' || agent.session?.header?.parentSession) return;
    const prompt = agent.ctx.get('systemPrompt');
    if (!prompt) return;
    prompt.section({name:'investment:output-language',order:90,interpolate:false,text:()=>{
      const selected = process.env.ATA_OUTPUT_LANGUAGE ?? ctx.get('settings')?.describe({redactSecrets:true}).find(row=>row.ns==='locale')?.value?.preference;
      return selected === 'en' ? 'Respond to the user in English. Write new explanations and summaries in English. Preserve original quotations, company names, tickers, evidence IDs, currencies and numerical values. Historical records remain in their original language. Fixed research workflows carry a separate frozen output language; never change their language or restart them when this interface preference changes.' : '使用简体中文回复用户；保留原始引用、公司名称、证券代码、证据编号、币种和数值。历史内容保留原文。固定研究流程有独立的输出语言快照，不得因界面切换改写或重启。';
    }});
  });
}
