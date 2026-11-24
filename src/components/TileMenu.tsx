import { Button, Modal } from './ui';
import { useStore } from '../lib/store';
import { closeTileMenu, removeTile, tileMenuStore } from '../lib/tiles';

// Small menu for a tile: open it, or remove it from MY SMART TV. Opened with the Menu key, right-click or long-press.
export function TileMenu() {
  const { tile } = useStore(tileMenuStore);
  if (!tile) return null;
  const what = tile.kind === 'builtin' ? 'app tile' : tile.kind === 'site' ? 'website' : tile.kind === 'exe' ? 'program' : 'Windows app';
  return (
    <Modal title={tile.title} onClose={closeTileMenu} width={42}>
      <div className="flex flex-col gap-[0.7rem]">
        <Button autoFocus primary icon="▶" onSelect={() => { closeTileMenu(); tile.open(); }}>Open</Button>
        <Button icon="🗑" className="!text-red-300" onSelect={async () => { closeTileMenu(); await removeTile(tile); }}>Remove this {what} from MY SMART TV</Button>
        <Button onSelect={closeTileMenu}>Cancel</Button>
        <p className="mt-[0.4rem] text-[1rem] leading-snug text-white/50">This only removes the shortcut. The app itself is not uninstalled or changed, and you can bring the tile back in Apps → Manage tiles.</p>
      </div>
    </Modal>
  );
}
