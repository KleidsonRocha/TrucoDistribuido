import type { FormEvent, RefObject } from 'react';

export type DoorEntryFormProps={
  nickname:string;error:string;walking:boolean;
  inputRef?:RefObject<HTMLInputElement|null>;
  onNickname:(value:string)=>void;
  onEnter:(event:FormEvent<HTMLFormElement>)=>void;
};

/** Controle essencial de entrada: DOM normal, independente do Canvas e de portais. */
export function DoorEntryForm({nickname,error,walking,inputRef,onNickname,onEnter}:DoorEntryFormProps) {
  return <div className="three-entry-form">
    <form className="door-sign" onSubmit={onEnter} noValidate aria-label="Identificação na porta do Neuro">
      <span className="door-sign-pin"/>
      <div className="door-open-label">ABERTO · PODE CHEGAR</div>
      <h1>Quem vai<br/><em>entrar?</em></h1>
      <label htmlFor="nickname">Escreva seu nome na porta</label>
      <input ref={inputRef} id="nickname" name="nickname" value={nickname} onChange={event=>onNickname(event.target.value)} placeholder="Seu apelido" maxLength={20} autoComplete="nickname" disabled={walking} aria-invalid={!!error} aria-describedby={error?'entry-error':'nickname-hint'}/>
      {error&&<p className="form-error" id="entry-error" role="alert">{error}</p>}
      <button className="primary full" type="submit" disabled={walking}>{walking?'Entrando no Neuro…':'Abrir a porta e entrar'} <span>→</span></button>
      <p id="nickname-hint">Sem cadastro. Só puxar uma cadeira.</p>
    </form>
  </div>;
}
