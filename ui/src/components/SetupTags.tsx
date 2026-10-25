/** How a run was set up, as two tags: whether an attack was planted, and whether VETO watched. */
export function SetupTags({ attack, veto }: { attack: boolean; veto: boolean }) {
  return (
    <>
      <span className={attack ? 'tag tag--claim' : 'tag'}>{attack ? 'Attack' : 'No attack'}</span>
      <span className={veto ? 'tag tag--veto' : 'tag'}>{veto ? 'With VETO' : 'Without VETO'}</span>
    </>
  );
}
