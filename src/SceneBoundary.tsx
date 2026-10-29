import { Component, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** O React monta este conteúdo dentro de <canvas> mesmo quando o WebGL funciona.
 * Deve continuar dentro dele: um portal faria o aviso aparecer sobre a cena válida. */
export function CanvasFallback({onUse2D}:{onUse2D:()=>void}) {
  return <div className="canvas-fallback"><h2>Seu navegador não consegue exibir o cenário.</h2><p>Você pode continuar na versão ilustrada do Neuro.</p><button onClick={onUse2D}>Abrir versão ilustrada →</button></div>;
}

export function GraphicsFallback({onUse2D,reason='scene-error',errorDetails}:{onUse2D:()=>void;reason?:'scene-error'|'context-lost';errorDetails?:string}) {
  return createPortal(<div className="graphics-fallback" role="alert"><span>NEURO · CENÁRIO 3D</span><h2>{reason==='context-lost'?'A sessão gráfica foi interrompida.':'Não foi possível preparar o 3D.'}</h2><p>{reason==='context-lost'?'A conexão com o contexto gráfico foi perdida. Você pode recarregar a página ou continuar na versão ilustrada.':'Ocorreu uma falha no carregamento ou na renderização do cenário. Tente novamente ou continue na versão ilustrada.'}</p>{errorDetails&&<details className="graphics-error-details"><summary>Detalhes do erro</summary><p>{errorDetails}</p></details>}<button className="primary" onClick={()=>location.reload()}>Tentar novamente ↻</button><button className="secondary" onClick={onUse2D}>Abrir versão ilustrada →</button></div>,document.body);
}
export class SceneBoundary extends Component<{children:ReactNode;onUse2D:()=>void},{error:Error|null}> {
  state:{error:Error|null}={error:null};
  static getDerivedStateFromError(error:unknown){return {error:error instanceof Error?error:new Error(String(error))};}
  render(){return this.state.error?<GraphicsFallback onUse2D={this.props.onUse2D} errorDetails={this.state.error.message}/>:this.props.children;}
}
