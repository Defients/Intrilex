import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { actionModeSupported, ACTION_PURPOSES } from '../../packages/policies/src/action-evaluation.mjs';

// Parse actual shipped authority enumerators, including template and ternary
// modes. A declaration is potential coverage, not proof of runtime reachability.
export async function policyActionInventory() {
  const rows=[];
  for(const name of ['core-autonomy','core-effects','core-advanced']) {
    const file=`runtime/autonomy-engine-dist/src/${name}.js`,source=await readFile(file,'utf8');
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    function samples(node) {
      if(ts.isStringLiteral(node))return[node.text];
      if(ts.isConditionalExpression(node))return[...samples(node.whenTrue),...samples(node.whenFalse)];
      if(ts.isTemplateExpression(node)) {
        let result=[node.head.text];
        for(const span of node.templateSpans) {
          const expr=span.expression.getText(ast),values=expr==='row'?['pr','er']:['su','twoSuit'].includes(expr)?['♣','♦','♥','♠']:expr==='r'?['A']:expr==='effect.mode'?['bounce-top']:expr==='effect.kind'?['three-bounce']:['sample'];
          result=result.flatMap(prefix=>values.map(value=>prefix+value+span.literal.text));
        }
        return result;
      }
      return node.getText(ast).startsWith('String(suit(')?['♣','♦','♥','♠']:[];
    }
    function add(family,mode,node) {
      if(!mode)return;
      const modeSamples=samples(mode);if(!modeSamples.length)return;
      const line=ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1;
      rows.push({file,line,family,modeExpression:mode.getText(ast),modeSamples,purpose:ACTION_PURPOSES[family]??null,
        classified:modeSamples.every(mode=>actionModeSupported({family,mode}))});
    }
    function visit(node) {
      if(ts.isObjectLiteralExpression(node)) {
        const family=node.properties.find(p=>p.name?.getText(ast)==='family')?.initializer;
        const mode=node.properties.find(p=>p.name?.getText(ast)==='mode')?.initializer;
        if(family&&ts.isStringLiteral(family))add(family.text,mode,node);
      }
      if(ts.isCallExpression(node)) {
        const call=node.expression.getText(ast),family=node.arguments[2];
        if(call==='action'&&family&&ts.isStringLiteral(family))add(family.text,node.arguments[3],node);
        if(call==='privateChoiceAction')add('private-choice',node.arguments[2],node);
      }
      ts.forEachChild(node,visit);
    }
    visit(ast);
  }
  return rows;
}
