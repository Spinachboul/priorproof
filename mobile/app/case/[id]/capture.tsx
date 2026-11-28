import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { discard, expired, uploadFile, type PendingFile } from '../../../src/files';
import { useSession } from '../../../src/session';
import { categories } from '../../../src/types';
import { Body, Button, Card, colors, Heading, Loading, Problem, Screen, Title, message } from '../../../src/ui';

const fallback = 'Other supporting documents';
const mimeTypes: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };

export default function Capture() {
  const { id, category } = useLocalSearchParams<{ id: string; category?: string }>();
  const { session, signOut } = useSession();
  const cache = useQueryClient();
  const [permission, ask] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const owned = useRef(new Set<string>());
  const mounted = useRef(true);
  const upload = useRef<AbortController | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [retaking, setRetaking] = useState<PendingFile | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [categoryFile, setCategoryFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    mounted.current = true;
    const copies = owned.current;
    return () => {
      mounted.current = false;
      upload.current?.abort();
      for (const uri of copies) void discard(uri);
      copies.clear();
    };
  }, []);

  function closeCamera() { setCameraOpen(false); setCameraReady(false); setRetaking(null); }

  function add(picks: { uri: string; name: string; owned: boolean }[]) {
    if (!mounted.current) {
      for (const pick of picks) if (pick.owned) void discard(pick.uri);
      return;
    }
    const accepted: PendingFile[] = [];
    let rejected = false;
    for (const pick of picks) {
      const extension = pick.name.toLowerCase().split('.').pop() || '';
      const mime = mimeTypes[extension];
      if (!mime || files.length + accepted.length >= 8) {
        rejected = true;
        if (pick.owned) void discard(pick.uri);
        continue;
      }
      if (pick.owned) owned.current.add(pick.uri);
      accepted.push({ ...pick, mime, id: randomUUID(), category: category && categories.includes(category) ? category : fallback });
    }
    setFiles(current => [...current, ...accepted]);
    if (rejected) setError('Choose up to eight PDF, PNG, or JPEG files. Convert HEIC images to JPEG first.');
  }

  function remove(file: PendingFile) {
    setFiles(current => current.filter(item => item.id !== file.id));
    if (file.owned) { owned.current.delete(file.uri); void discard(file.uri); }
  }

  async function openCamera(replace?: PendingFile) {
    setError('');
    try {
      const result = permission?.granted ? permission : await ask();
      if (!result.granted) throw new Error('Allow camera access in device settings or choose an existing file.');
      setRetaking(replace ?? null);
      setCameraOpen(true);
    } catch (failure) { setError(message(failure)); }
  }

  async function takePhoto() {
    setSelecting(true);
    setError('');
    try {
      const image = await camera.current?.takePictureAsync({ quality: 0.8, exif: false });
      if (!image) throw new Error('The camera did not return a photo.');
      closeCamera();
      if (retaking && mounted.current) {
        owned.current.add(image.uri);
        setFiles(current => current.map(item => item.id === retaking.id ? {
          ...item, id: randomUUID(), uri: image.uri, name: 'capture-retake.jpg', mime: 'image/jpeg', owned: true,
        } : item));
        if (retaking.owned) { owned.current.delete(retaking.uri); void discard(retaking.uri); }
      } else {
        add([{ uri: image.uri, name: `capture-${files.length + 1}.jpg`, owned: true }]);
      }
    } catch (failure) { setError(message(failure)); }
    finally { setSelecting(false); }
  }

  async function select(kind: 'gallery' | 'pdf') {
    setSelecting(true);
    setError('');
    try {
      if (kind === 'pdf') {
        const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true });
        if (!result.canceled) add(result.assets.map(asset => ({ ...asset, name: asset.name, owned: true })));
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 8 - files.length, quality: 0.8, exif: false,
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        });
        if (!result.canceled) add(result.assets.map((asset, index) => {
          const suffix = asset.uri.split('?')[0].split('.').pop()?.toLowerCase();
          const name = suffix && mimeTypes[suffix] ? `gallery-${index + 1}.${suffix}` : asset.fileName || `gallery-${index + 1}.jpg`;
          // Only delete library-picker copies located in its private cache.
          const owned = /^file:.*\/cache\/.*(?:ImagePicker|image_picker)\//i.test(asset.uri) || /\/Library\/Caches\/.*(?:ImagePicker|image_picker)\//i.test(asset.uri);
          return { uri: asset.uri, name, owned };
        }));
      }
    } catch (failure) { setError(message(failure)); }
    finally { setSelecting(false); }
  }

  async function send() {
    if (!session || upload.current) return;
    const controller = new AbortController();
    upload.current = controller;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`File ${index + 1} of ${files.length} · uploading`);
        await uploadFile(session, id, file, percent => {
          setProgress(percent === 100 ? `File ${index + 1} of ${files.length} · server processing` : `File ${index + 1} of ${files.length} · ${percent}%`);
        }, controller.signal);
        if (mounted.current) remove(file);
      }
      if (mounted.current) setNotice('Upload complete. Open Agent tasks to confirm the requested document and resume.');
    } catch (failure) {
      if (expired(failure)) await signOut();
      else if (mounted.current) setError(message(failure));
    } finally {
      upload.current = null;
      if (mounted.current) { setBusy(false); setProgress(''); }
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['case', id] }),
        cache.invalidateQueries({ queryKey: ['agent', id] }),
        cache.invalidateQueries({ queryKey: ['integrity-summary', id] }),
        cache.invalidateQueries({ queryKey: ['cases'] }),
      ]);
    }
  }

  return <Screen>
    <Heading>Capture documents</Heading>
    <Body>Frame every page clearly. Upload only fictional records during the demo.</Body>
    <Button title="Take a photo" disabled={busy || selecting || files.length >= 8} onPress={() => openCamera()} />
    <Button title="Choose gallery images" secondary disabled={busy || selecting || files.length >= 8} onPress={() => select('gallery')} />
    <Button title="Choose PDF files" secondary disabled={busy || selecting || files.length >= 8} onPress={() => select('pdf')} />
    {selecting && <Loading />}
    {files.map(file => <Card key={file.id}>
      <Title>{file.name}</Title>
      {file.mime.startsWith('image/') && <Image source={{ uri: file.uri }} accessibilityLabel={`Preview of ${file.name}`} resizeMode="contain" style={{ height: 200, width: '100%', backgroundColor: colors.background }} />}
      <Button title={file.category} secondary disabled={busy} onPress={() => setCategoryFile(file.id)} />
      {file.mime.startsWith('image/') && <Button title="Retake image" secondary disabled={busy || selecting} onPress={() => openCamera(file)} />}
      <Button title="Remove file" secondary disabled={busy || selecting} onPress={() => remove(file)} />
    </Card>)}
    {error && <Problem message={error} />}
    {notice && <Text accessibilityLiveRegion="polite" style={{ color: colors.teal, fontSize: 16 }}>{notice}</Text>}
    {files.length > 0 && <Button title={busy ? 'Uploading…' : error ? 'Retry remaining uploads' : `Upload ${files.length} file(s)`} disabled={busy} onPress={send} />}
    {progress && <Text accessibilityLiveRegion="polite">{progress}</Text>}
    <Modal visible={cameraOpen} onRequestClose={closeCamera} animationType="slide">
      <View style={{ flex: 1, paddingTop: 46, backgroundColor: colors.dark }}>
        {cameraOpen && <CameraView ref={camera} style={{ flex: 1 }} facing="back" onCameraReady={() => setCameraReady(true)}
          onMountError={() => { closeCamera(); setError('The device camera could not start.'); }} />}
        <View style={{ padding: 16, paddingBottom: 36, gap: 8 }}>
          <Button title="Capture photo" disabled={!cameraReady || selecting} onPress={takePhoto} />
          <Button title="Close camera" secondary disabled={selecting} onPress={closeCamera} />
        </View>
      </View>
    </Modal>
    <Modal visible={!!categoryFile} onRequestClose={() => setCategoryFile(null)} animationType="slide">
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 55, gap: 10 }}>
        <Heading>Document category</Heading>
        {categories.map(option => <Pressable key={option} accessibilityRole="button"
          onPress={() => { setFiles(current => current.map(file => file.id === categoryFile ? { ...file, category: option, id: randomUUID() } : file)); setCategoryFile(null); }}
          style={{ minHeight: 48, justifyContent: 'center', padding: 12, backgroundColor: colors.background }}>
          <Text style={{ fontSize: 16, color: colors.teal }}>{option}</Text>
        </Pressable>)}
        <Button title="Cancel" secondary onPress={() => setCategoryFile(null)} />
      </ScrollView>
    </Modal>
  </Screen>;
}
