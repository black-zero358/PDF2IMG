import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Image as ImageIcon, Download, Settings, FileText, CheckCircle, AlertCircle, Loader, RefreshCw, Trash2 } from 'lucide-react';

// 动态加载外部脚本的 Hook
const useScript = (src) => {
  const [status, setStatus] = useState(src ? 'loading' : 'idle');

  useEffect(() => {
    if (!src) {
      setStatus('idle');
      return;
    }
    let script = document.querySelector(`script[src="${src}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.setAttribute('data-status', 'loading');
      document.body.appendChild(script);
      const setAttributeFromEvent = (event) => {
        script.setAttribute('data-status', event.type === 'load' ? 'ready' : 'error');
        setStatus(event.type === 'load' ? 'ready' : 'error');
      };
      script.addEventListener('load', setAttributeFromEvent);
      script.addEventListener('error', setAttributeFromEvent);
    } else {
      setStatus(script.getAttribute('data-status'));
    }
  }, [src]);

  return status;
};

// 简单的 UI 组件
const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", disabled = false, className = "" }) => {
  const baseStyle = "px-4 py-2 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95";
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-lg shadow-slate-200",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-300",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100",
    ghost: "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Label = ({ children }) => (
  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 ml-1">
    {children}
  </label>
);

export default function App() {
  // 加载必要的库
  const pdfJsStatus = useScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  const pdfWorkerStatus = useScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');
  const jszipStatus = useScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  const fileSaverStatus = useScript('https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js');

  const [isReady, setIsReady] = useState(false);
  const [file, setFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, processing, done, error
  const [progress, setProgress] = useState(0);
  const [convertedImages, setConvertedImages] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  // 设置状态
  const [settings, setSettings] = useState({
    format: 'png', // png, jpeg
    quality: 0.9,  // 0.1 - 1.0 (仅 JPEG)
    scale: 2,      // 1.5, 2 (HD), 3 (Ultra)
    maxPageWidth: 0 // 0 表示原始大小
  });

  // 检查依赖库是否加载完成
  useEffect(() => {
    if (pdfJsStatus === 'ready' && pdfWorkerStatus === 'ready' && jszipStatus === 'ready' && fileSaverStatus === 'ready') {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        setIsReady(true);
      }
    }
  }, [pdfJsStatus, pdfWorkerStatus, jszipStatus, fileSaverStatus]);

  // 处理文件上传
  const handleFileChange = async (selectedFile) => {
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setConvertedImages([]);
      setStatus('idle');
      setErrorMsg('');
      setProgress(0);
      
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
      } catch (err) {
        console.error(err);
        setErrorMsg('无法解析 PDF 文件，文件可能已损坏。');
      }
    } else {
      setErrorMsg('请上传有效的 PDF 文件。');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // 核心转换逻辑
  const startConversion = async () => {
    if (!pdfDoc) return;
    setStatus('processing');
    setProgress(0);
    setConvertedImages([]);

    const images = [];
    const totalPages = pdfDoc.numPages;

    try {
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        
        // 计算视口大小
        let viewport = page.getViewport({ scale: settings.scale });
        
        // 如果设置了最大宽度，重新计算缩放比例
        if (settings.maxPageWidth > 0 && viewport.width > settings.maxPageWidth) {
           const scaleRatio = settings.maxPageWidth / viewport.width;
           viewport = page.getViewport({ scale: settings.scale * scaleRatio });
        }

        // 创建 Canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // 渲染页面到 Canvas
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        // 导出图片
        const mimeType = settings.format === 'png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, settings.quality);
        
        images.push({
          page: i,
          dataUrl: dataUrl,
          width: canvas.width,
          height: canvas.height
        });

        // 更新进度，使用 requestAnimationFrame 给 UI 喘息时间
        setProgress(Math.round((i / totalPages) * 100));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }

      setConvertedImages(images);
      setStatus('done');
    } catch (err) {
      console.error(err);
      setErrorMsg('转换过程中发生错误: ' + err.message);
      setStatus('error');
    }
  };

  // 打包下载
  const downloadAll = async () => {
    if (convertedImages.length === 0) return;

    if (convertedImages.length === 1) {
      // 单张直接下载
      window.saveAs(convertedImages[0].dataUrl, `page-1.${settings.format}`);
    } else {
      // 多张打包 Zip
      const zip = new window.JSZip();
      const folder = zip.folder("images");
      
      convertedImages.forEach((img) => {
        const base64Data = img.dataUrl.split(',')[1];
        folder.file(`page-${img.page}.${settings.format}`, base64Data, { base64: true });
      });

      const content = await zip.generateAsync({ type: "blob" });
      window.saveAs(content, `${file.name.replace('.pdf', '')}-images.zip`);
    }
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-4">
        <Loader className="w-8 h-8 animate-spin text-slate-400" />
        <p className="text-slate-500 text-sm">正在初始化转换引擎...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-slate-200">
      
      {/* 头部 */}
      <header className="bg-white border-b border-slate-100 py-4 px-6 sticky top-0 z-10 bg-opacity-80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-slate-900 text-white p-2 rounded-lg">
              <ImageIcon size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">PDF 转换器 <span className="text-slate-400 font-normal ml-1 text-sm">Pro</span></h1>
          </div>
          <a href="#" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">关于</a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-8">
        
        {/* 主要操作区 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 左侧：设置面板 */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="p-6 sticky top-24">
              <div className="flex items-center gap-2 mb-6 text-slate-900">
                <Settings size={18} />
                <h2 className="font-bold">输出设置</h2>
              </div>

              <div className="space-y-6">
                {/* 格式选择 */}
                <div>
                  <Label>图片格式</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {['png', 'jpeg'].map(fmt => (
                      <button
                        key={fmt}
                        onClick={() => setSettings({ ...settings, format: fmt })}
                        className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                          settings.format === fmt 
                            ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 质量控制 (仅 JPEG) */}
                <div className={`transition-all duration-300 ${settings.format === 'jpeg' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  <Label>压缩质量 ({Math.round(settings.quality * 100)}%)</Label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={settings.quality}
                    onChange={(e) => setSettings({ ...settings, quality: parseFloat(e.target.value) })}
                    className="w-full accent-slate-900 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>低文件大小</span>
                    <span>高画质</span>
                  </div>
                </div>

                {/* 清晰度/DPI 缩放 */}
                <div>
                  <Label>渲染倍率 (DPI)</Label>
                  <select 
                    value={settings.scale}
                    onChange={(e) => setSettings({ ...settings, scale: parseFloat(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none"
                  >
                    <option value="1">1x (标准屏幕, 72 DPI)</option>
                    <option value="1.5">1.5x (中等清晰度)</option>
                    <option value="2">2x (高清 Retina, 144 DPI)</option>
                    <option value="3">3x (超清打印级, 216 DPI)</option>
                    <option value="4">4x (极高画质)</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-2">倍率越高，图片越清晰，但转换速度越慢。</p>
                </div>
                
                {/* 宽度限制 */}
                 <div>
                  <Label>宽度限制 (可选)</Label>
                  <input 
                    type="number" 
                    placeholder="例如: 1920 (0 为原图)"
                    value={settings.maxPageWidth || ''}
                    onChange={(e) => setSettings({...settings, maxPageWidth: parseInt(e.target.value) || 0})}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-slate-900 outline-none"
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* 右侧：上传与预览 */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 上传区域 */}
            {!file ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`
                  relative border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-300 ease-in-out
                  ${isDragging ? 'border-slate-900 bg-slate-50 scale-[1.01]' : 'border-slate-200 hover:border-slate-300 hover:bg-white'}
                `}
              >
                <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Upload size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">拖拽 PDF 文件到这里</h3>
                <p className="text-slate-500 mb-8">或者点击下方按钮选择文件</p>
                <label className="inline-flex cursor-pointer">
                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFileChange(e.target.files[0])} />
                  <span className="bg-slate-900 text-white px-6 py-3 rounded-xl font-medium shadow-xl shadow-slate-200 hover:shadow-2xl hover:bg-slate-800 transition-all active:scale-95">
                    选择文件
                  </span>
                </label>
                <p className="mt-8 text-xs text-slate-400">所有处理均在浏览器本地完成，文件不会上传至服务器</p>
              </div>
            ) : (
              // 文件已选择状态
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4 w-full">
                    <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center shrink-0">
                      <FileText size={24} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{file.name}</p>
                      <p className="text-sm text-slate-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • {pdfDoc ? `${pdfDoc.numPages} 页` : '解析中...'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    {status === 'idle' && (
                       <Button variant="ghost" onClick={() => setFile(null)} className="flex-1 md:flex-none">
                         <Trash2 size={16} /> 移除
                       </Button>
                    )}
                    {status === 'idle' && (
                      <Button onClick={startConversion} className="flex-1 md:flex-none">
                        开始转换
                        <RefreshCw size={18} />
                      </Button>
                    )}
                  </div>
                </Card>

                {/* 错误提示 */}
                {errorMsg && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 border border-red-100">
                    <AlertCircle size={20} />
                    {errorMsg}
                  </div>
                )}

                {/* 进度条 */}
                {status === 'processing' && (
                  <Card className="p-8 text-center space-y-4">
                    <Loader className="w-8 h-8 animate-spin text-slate-900 mx-auto" />
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">正在转换中...</h3>
                      <p className="text-slate-500">请稍候，正在为您生成高分辨率图片</p>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-slate-900 h-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs font-mono text-slate-400">{progress}%</p>
                  </Card>
                )}

                {/* 结果预览区 */}
                {status === 'done' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <CheckCircle className="text-green-500" size={24} />
                        转换完成
                      </h3>
                      <div className="flex gap-2">
                         <Button variant="secondary" onClick={() => { setStatus('idle'); setConvertedImages([]); }}>
                           重置
                         </Button>
                         <Button onClick={downloadAll}>
                           下载全部 ({convertedImages.length})
                           <Download size={18} />
                         </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {convertedImages.map((img) => (
                        <div key={img.page} className="group relative bg-white p-2 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                          <div className="aspect-[3/4] bg-slate-100 rounded-lg overflow-hidden relative">
                             <img src={img.dataUrl} alt={`Page ${img.page}`} className="w-full h-full object-contain" />
                             <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                          </div>
                          <div className="mt-3 px-1 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold text-slate-700">第 {img.page} 页</p>
                              <p className="text-xs text-slate-400">{img.width} x {img.height} px</p>
                            </div>
                            <button 
                              onClick={() => window.saveAs(img.dataUrl, `page-${img.page}.${settings.format}`)}
                              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                              title="下载此图"
                            >
                              <Download size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}