import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MapPin, Navigation, Pencil, Plus, Save, UtensilsCrossed, X } from 'lucide-react';
import { api } from '../api/client';
import type { Arena, ArenaRink } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import TeamLogo from '../components/TeamLogo';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { canManageArena } from '../lib/permissions';
import { mapsQueryUrl } from '../lib/maps';
import { accentLinkClass, accentSelectorPillActiveClass, chromeIconButtonClass, selectorPillClass, selectorPillIdleClass } from '../lib/uiClasses';
const emptyRinkForm={name:'',notes:''};
const emptyArenaForm={name:'',address:'',city:'',state:'',zip_code:'',phone:'',contact_email:'',website:'',notes:''};
export default function ArenaDetailPage(){
 const {arenaId=''}=useParams();const navigate=useNavigate();const {authEnabled,me}=useAuth();const pushToast=useToast();
 const arenaEditable=!authEnabled||canManageArena(me);
 const [arena,setArena]=useState<Arena|null>(null),[rinks,setRinks]=useState<ArenaRink[]>([]),[error,setError]=useState('');
 const [selectedRinkId,setSelectedRinkId]=useState('');
 const [arenaEditOpen,setArenaEditOpen]=useState(false),[arenaForm,setArenaForm]=useState(emptyArenaForm);
 const [rinkModalOpen,setRinkModalOpen]=useState(false),[editRink,setEditRink]=useState<ArenaRink|null>(null),[rinkForm,setRinkForm]=useState(emptyRinkForm);
 const loadArena=()=>api.getArena(arenaId).then(data=>{setArena(data);setArenaForm({...emptyArenaForm,...data,website:data.website||'',notes:data.notes||''});});
 const loadRinks=()=>api.getArenaRinks(arenaId).then(data=>{setRinks(data);setSelectedRinkId(current=>data.some(r=>r.id===current)?current:data[0]?.id||'');});
 useEffect(()=>{Promise.all([loadArena(),loadRinks()]).catch(e=>setError(String(e)));},[arenaId]); // eslint-disable-line react-hooks/exhaustive-deps
 const selectRink=(id:string)=>setSelectedRinkId(id);
 const openCreateRink=()=>{setEditRink(null);setRinkForm(emptyRinkForm);setRinkModalOpen(true);};
 const openEditRink=(rink:ArenaRink)=>{setEditRink(rink);setRinkForm({name:rink.name,notes:rink.notes||''});setRinkModalOpen(true);};
 const saveArena=async()=>{try{await api.updateArena(arenaId,{...arenaForm,website:arenaForm.website||null,notes:arenaForm.notes||null});setArenaEditOpen(false);await loadArena();pushToast({variant:'success',title:'Arena updated'});}catch(e){pushToast({variant:'error',title:'Unable to update arena',description:String(e)});}};
 const saveRink=async()=>{try{const payload={name:rinkForm.name,notes:rinkForm.notes||null};if(editRink)await api.updateArenaRink(editRink.id,payload);else await api.createArenaRink(arenaId,payload);setRinkModalOpen(false);await loadRinks();pushToast({variant:'success',title:'Rink saved'});}catch(e){pushToast({variant:'error',title:'Unable to save rink',description:String(e)});}};
 if(error)return <Alert variant="error">{error}</Alert>;if(!arena)return <Alert variant="info">Loading arena...</Alert>;
 const selectedRink=rinks.find(r=>r.id===selectedRinkId)||null;
 const cityStateZip=[arena.city,arena.state,arena.zip_code].filter(Boolean).join(' ');
 const arenaAddressLabel=[arena.address,cityStateZip].filter(Boolean).join(' • ');
 const arenaLocationLabel=[arena.name,arena.address,cityStateZip].filter(Boolean).join(', ');
 const directionsUrl=arenaLocationLabel?mapsQueryUrl(arenaLocationLabel):null,restaurantsUrl=arenaLocationLabel?mapsQueryUrl('restaurants near '+arenaLocationLabel):null,thingsUrl=arenaLocationLabel?mapsQueryUrl('things to do near '+arenaLocationLabel):null;
 return <div className="space-y-4"><PageHeader
        title={arena.name}
        subtitle={arenaAddressLabel || 'Manage rinks.'}
        actions={(
          <>
            <Button type="button" variant="ghost" onClick={() => navigate('/arenas')}>
              <ChevronLeft className="h-4 w-4" />
              Back to Arenas
            </Button>
            {arenaEditable ? (
              <Button type="button" variant="outline" onClick={() => setArenaEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit Arena
              </Button>
            ) : null}
            {arenaEditable ? (
              <Button type="button" onClick={openCreateRink}>
                <Plus className="h-4 w-4" />
                Add Rink
              </Button>
            ) : null}
          </>
        )}
      /><Card className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <TeamLogo name={arena.name} logoUrl={arena.logo_url} className="h-16 w-16 rounded-2xl" initialsClassName="text-lg" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{arena.name}</div>
              {arenaAddressLabel ? (
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {arenaAddressLabel}
                </div>
              ) : null}
              {arena.contact_email ? (
                <div className="mt-1 truncate text-sm">
                  <a href={`mailto:${arena.contact_email}`} className={accentLinkClass}>
                    {arena.contact_email}
                  </a>
                </div>
              ) : null}
              {arena.website ? (
                <div className="mt-1 truncate text-sm">
                  <a href={arena.website} target="_blank" rel="noopener noreferrer" className={accentLinkClass}>
                    {arena.website}
                  </a>
                </div>
              ) : null}
            </div>
          </div>
          {directionsUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="icon" className={chromeIconButtonClass} onClick={() => window.open(directionsUrl, '_blank', 'noopener,noreferrer')} aria-label="Open directions" title="Directions">
                <Navigation className="h-4 w-4" />
              </Button>
              {restaurantsUrl ? (
                <Button type="button" variant="ghost" size="icon" className={chromeIconButtonClass} onClick={() => window.open(restaurantsUrl, '_blank', 'noopener,noreferrer')} aria-label="Open restaurants nearby" title="Restaurants Nearby">
                  <UtensilsCrossed className="h-4 w-4" />
                </Button>
              ) : null}
              {thingsUrl ? (
                <Button type="button" variant="ghost" size="icon" className={chromeIconButtonClass} onClick={() => window.open(thingsUrl, '_blank', 'noopener,noreferrer')} aria-label="Open things to do nearby" title="Things To Do Nearby">
                  <MapPin className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card><Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {rinks.map((rink) => (
            <button
              key={rink.id}
              type="button"
              onClick={() => selectRink(rink.id)}
              className={`${selectorPillClass} px-4 py-2 ${selectedRinkId === rink.id ? accentSelectorPillActiveClass : selectorPillIdleClass}`}
            >
              {rink.name}
            </button>
          ))}
        </div>
        {selectedRink ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">


            {arenaEditable ? (
              <>

                <Button type="button" variant="outline" size="sm" onClick={() => openEditRink(selectedRink)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Rink
                </Button>

              </>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">Add a rink for game and practice locations.</div>
        )}
      </Card><Modal
        open={arenaEditOpen}
        onClose={() => setArenaEditOpen(false)}
        title="Edit Arena"
        footer={(
          <>
            <Button type="button" onClick={saveArena}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setArenaEditOpen(false)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <Input value={arenaForm.name} onChange={(event) => setArenaForm((current) => ({ ...current, name: event.target.value }))} placeholder="Arena name" />
          <Input value={arenaForm.address} onChange={(event) => setArenaForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input value={arenaForm.city} onChange={(event) => setArenaForm((current) => ({ ...current, city: event.target.value }))} placeholder="City" />
            <Input value={arenaForm.state} onChange={(event) => setArenaForm((current) => ({ ...current, state: event.target.value }))} placeholder="State" />
            <Input value={arenaForm.zip_code} onChange={(event) => setArenaForm((current) => ({ ...current, zip_code: event.target.value }))} placeholder="Zip" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input value={arenaForm.phone} onChange={(event) => setArenaForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
            <Input value={arenaForm.contact_email} onChange={(event) => setArenaForm((current) => ({ ...current, contact_email: event.target.value }))} placeholder="Contact email" />
          </div>
          <Input value={arenaForm.website} onChange={(event) => setArenaForm((current) => ({ ...current, website: event.target.value }))} placeholder="Website" />
          <Input value={arenaForm.notes} onChange={(event) => setArenaForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
        </div>
      </Modal><Modal
        open={rinkModalOpen}
        onClose={() => setRinkModalOpen(false)}
        title={editRink ? 'Edit Arena Rink' : 'Add Arena Rink'}
        footer={(
          <>
            <Button type="button" onClick={saveRink} disabled={!rinkForm.name}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setRinkModalOpen(false)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <Input value={rinkForm.name} onChange={(event) => setRinkForm((current) => ({ ...current, name: event.target.value }))} placeholder="Rink name" />
          <Input value={rinkForm.notes} onChange={(event) => setRinkForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
        </div>
      </Modal></div>;
}
