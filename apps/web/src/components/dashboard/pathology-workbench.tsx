'use client';

import Image from 'next/image';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bot, ChevronLeft, ChevronRight, Eye, PencilLine, Ruler, Search, ShieldCheck, UserRound } from 'lucide-react';
import { getSlide, getSlideAssetUrl, getSlideFocusRoiUrl, listSlides } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SlideRecord } from '@/types/slide';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WsiViewer, WsiViewerHandle } from '@/components/dashboard/wsi-viewer';

const INVASIVE_TYPE_OPTIONS = [
  { id: 'IDC', label: '浸润性导管癌 (IDC)' },
  { id: 'ILC', label: '浸润性小叶癌 (ILC)' },
];

const GRADE_OPTIONS = [
  { id: 'G1', label: 'I 级' },
  { id: 'G2', label: 'II 级' },
  { id: 'G3', label: 'III 级' },
];

const OTHER_TYPE_OPTIONS = [
  { id: 'DCIS', label: '导管原位癌 (DCIS)' },
  { id: 'MICROCALC', label: '微钙化伴随' },
  { id: 'ITC', label: '孤立肿瘤细胞 (ITC)' },
];

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatCount(value: number | null) {
  return value == null ? '未预处理' : value.toLocaleString('zh-CN');
}

function formatRuntime(value: number | null) {
  return value == null ? '未预处理' : `${value.toFixed(2)}s`;
}

function formatPercentRatio(value: number | null | undefined) {
  return value == null ? '未预处理' : `${(value * 100).toFixed(2)}%`;
}

function getSlideStatus(slide: SlideRecord) {
  return slide.ai_prediction_status ?? slide.status ?? 'pending';
}

function getSlideNumber(slide: SlideRecord) {
  if (slide.slice_no?.trim()) {
    return slide.slice_no.trim();
  }

  if (slide.id.trim()) {
    return slide.id.trim();
  }

  return slide.filename.replace(/\.[^.]+$/, '');
}

function getSlideAnatomy(slide: SlideRecord) {
  return slide.anatomy_location?.trim() || '部位待标注';
}

function getSlideStain(slide: SlideRecord) {
  return slide.stain_type?.trim() || 'HE';
}

function getSlideThumbnailSrc(slide: SlideRecord) {
  return slide.thumbnail_url?.trim() || getSlideAssetUrl(slide.id, 'thumbnail');
}

function getStatusBadgeClasses(status: SlideRecord['status']) {
  if (status === 'positive') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  if (status === 'negative') {
    return 'border-green-200 bg-green-50 text-green-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function getStatusText(status: SlideRecord['status']) {
  if (status === 'positive') {
    return '预测有癌';
  }

  if (status === 'negative') {
    return '预测无癌';
  }

  return '分析中';
}

function SlideThumbnailPlaceholder() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_rgba(234,239,244,0.92)_45%,_rgba(213,221,230,0.92)_100%)]">
      <div className="absolute inset-3 rounded-xl border border-white/70 bg-white/55" />
      <div className="absolute left-3 top-3 h-3 w-3 rounded-full bg-slate-300/80" />
      <div className="absolute right-4 top-4 h-10 w-10 rounded-full bg-rose-200/70 blur-md" />
      <div className="grid grid-cols-3 gap-2 px-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <span
            key={index}
            className={cn(
              'h-4 w-4 rounded-full border border-slate-400/20 bg-slate-500/45 shadow-[0_0_0_2px_rgba(255,255,255,0.45)]',
              index % 2 === 0 ? 'translate-y-1' : '-translate-y-1',
            )}
          />
        ))}
      </div>
    </div>
  );
}

function SlideThumbnail({ slide }: { slide: SlideRecord }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <SlideThumbnailPlaceholder />;
  }

  return (
    <img
      src={getSlideThumbnailSrc(slide)}
      alt={`${getSlideNumber(slide)} 缩略图`}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function SlideListSkeleton() {
  return (
    <div className="space-y-3 px-1 pb-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-3xl border border-slate-200 bg-slate-100/90 p-3 shadow-[0_10px_28px_-20px_rgba(15,23,42,0.4)]">
          <div className="flex items-center gap-3">
            <div className="h-20 w-28 flex-shrink-0 rounded-2xl bg-slate-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-28 rounded-full bg-slate-200" />
              <div className="h-4 w-20 rounded-full bg-slate-200" />
              <div className="h-7 w-24 rounded-full bg-slate-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SlideSidebarCard({
  slide,
  active,
  onSelect,
}: {
  slide: SlideRecord;
  active: boolean;
  onSelect: () => void;
}) {
  const status = getSlideStatus(slide);
  const slideNumber = getSlideNumber(slide);
  const anatomy = getSlideAnatomy(slide);
  const stainType = getSlideStain(slide);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200',
          active
            ? 'border-gray-200 border-l-4 border-l-blue-500 bg-slate-50'
            : 'border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,245,249,0.95))] hover:border-slate-300 hover:bg-[linear-gradient(135deg,rgba(248,250,252,1),rgba(239,244,248,1))] hover:shadow-[0_14px_30px_-26px_rgba(15,23,42,0.9)]',
        )}
      >
        <div className="relative h-20 w-28 flex-shrink-0 overflow-hidden rounded-2xl border border-white/60 bg-slate-200 shadow-inner shadow-slate-300/40">
          <SlideThumbnail slide={slide} />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={cn('truncate text-sm font-semibold tracking-tight', active ? 'text-slate-900' : 'text-slate-800')}
            title={slideNumber}
          >
            {slideNumber}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500" title={`${anatomy} | ${stainType}`}>
            {anatomy} | {stainType}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold leading-none shadow-sm',
                getStatusBadgeClasses(status),
              )}
            >
              <Bot className="h-3 w-3" />
              <span className="truncate">{getStatusText(status)}</span>
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

function toSummaryText(slide: SlideRecord | null) {
  if (!slide?.diagnosis) {
    return '待预处理';
  }

  return slide.diagnosis.predicted_label === 'Tumor' ? '阳性 (Tumor)' : '阴性 (Normal)';
}

function inferBreastPanelSelections(slide: SlideRecord | null) {
  if (!slide || getSlideStatus(slide) !== 'positive') {
    return {
      invasiveType: null,
      grade: null,
      others: [] as string[],
    };
  }

  const tumorProbability = slide.diagnosis?.probabilities[1] ?? 0;
  const suspiciousFocusCount = slide.diagnosis?.warning_summary.suspicious_focus_count ?? 0;
  const highRiskAreaRatio = slide.diagnosis?.warning_summary.high_risk_area_ratio ?? 0;
  const largestFocusPatchCount = slide.diagnosis?.warning_summary.largest_focus_patch_count ?? 0;

  let grade = 'G1';
  if (tumorProbability >= 0.85 || highRiskAreaRatio >= 0.03) {
    grade = 'G3';
  } else if (tumorProbability >= 0.65 || highRiskAreaRatio >= 0.01) {
    grade = 'G2';
  }

  const others: string[] = [];
  if (largestFocusPatchCount <= 12 && suspiciousFocusCount <= 2) {
    others.push('ITC');
  }
  if (suspiciousFocusCount >= 4 || highRiskAreaRatio >= 0.02) {
    others.push('MICROCALC');
  }

  return {
    invasiveType: 'IDC',
    grade,
    others,
  };
}

function getGradeLabel(gradeId: string | null) {
  return GRADE_OPTIONS.find((option) => option.id === gradeId)?.label ?? '未分级';
}

function getOptionLabel(options: { id: string; label: string }[], id: string) {
  return options.find((option) => option.id === id)?.label ?? id;
}

function buildBreastReport(
  slide: SlideRecord | null,
  invasiveType: string | null,
  grade: string | null,
  otherTags: string[],
) {
  if (!slide) {
    return '请在左侧选择一张切片，系统将生成对应的乳腺癌实时诊断摘要。';
  }

  const slideNo = getSlideNumber(slide);
  const anatomy = getSlideAnatomy(slide);
  const stainType = getSlideStain(slide);
  const status = getSlideStatus(slide);
  const tumorProbability = slide.diagnosis?.probabilities[1] ?? 0;
  const warningSummary = slide.diagnosis?.warning_summary;

  if (status === 'negative') {
    return `${slideNo}（${anatomy}，${stainType}）AI 未提示明确的乳腺癌转移灶。当前肿瘤检出概率为 ${percent(tumorProbability)}，疑似灶定位结果为阴性。建议结合 H&E 全切片阅片结果，作为前哨淋巴结阴性模版报告使用。`;
  }

  if (status === 'pending' || !slide.diagnosis) {
    return `${slideNo}（${anatomy}，${stainType}）正在进行 AI 推理，请等待模型完成后查看亚型预测、ROI 定位与结构化切片报告。`;
  }

  const subtypeLabel = invasiveType ? getOptionLabel(INVASIVE_TYPE_OPTIONS, invasiveType) : '待医生确认亚型';
  const gradeLabel = getGradeLabel(grade);
  const otherText = otherTags.length > 0 ? otherTags.map((tag) => getOptionLabel(OTHER_TYPE_OPTIONS, tag)).join('，') : '未见额外伴随特征';
  const highRiskArea = formatPercentRatio(warningSummary?.high_risk_area_ratio);
  const suspiciousCount = warningSummary?.suspicious_focus_count ?? 0;

  return `${slideNo}（${anatomy}，${stainType}）AI 预测提示乳腺癌转移风险，肿瘤检出概率 ${percent(tumorProbability)}。当前模型建议优先关注 ${subtypeLabel}，组织学分级倾向 ${gradeLabel}；伴随特征：${otherText}。本次共检出 ${suspiciousCount} 个疑似灶，高风险面积占比 ${highRiskArea}。建议结合主视图 ROI 逐一复核后，形成最终病理结论。`;
}

function DiagnosticChoiceChip({
  label,
  selected,
  aiHigh,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  aiHigh?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-all',
        disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
          : selected
            ? 'border-red-200 bg-red-50/80 text-red-700 shadow-sm'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/70',
      )}
    >
      {label}
    </button>
  );
}

export function PathologyWorkbench() {
  const [slides, setSlides] = useState<SlideRecord[]>([]);
  const [currentSlide, setCurrentSlide] = useState<SlideRecord | null>(null);
  const [search, setSearch] = useState('');
  const [selectedAnatomy, setSelectedAnatomy] = useState('all');
  const [selectedStain, setSelectedStain] = useState('all');
  const [selectedPrediction, setSelectedPrediction] = useState('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [slidesLoading, setSlidesLoading] = useState(true);
  const deferredSearch = useDeferredValue(search);
  const [heatmapOn, setHeatmapOn] = useState(true);
  const [heatmapOpacity, setHeatmapOpacity] = useState(46);
  const [loadingMessage, setLoadingMessage] = useState('等待切片载入');
  const [coordinateText, setCoordinateText] = useState('X: ---% | Y: ---%');
  const [zoomText, setZoomText] = useState('1.00x');
  const [panelBusy, setPanelBusy] = useState(true);
  const [selectedInvasiveType, setSelectedInvasiveType] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedOtherTypes, setSelectedOtherTypes] = useState<string[]>([]);
  const [reportEditable, setReportEditable] = useState(false);
  const [reportDirty, setReportDirty] = useState(false);
  const [reportText, setReportText] = useState('');
  const [rulerMode, setRulerMode] = useState(false);
  const viewerRef = useRef<WsiViewerHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeLoadRequestRef = useRef(0);

  function nextLoadRequestId() {
    activeLoadRequestRef.current += 1;
    return activeLoadRequestRef.current;
  }

  const filteredSlides = slides.filter((slide) => {
    const normalized = deferredSearch.trim().toLowerCase();
    const matchesSearch =
      !normalized ||
      slide.filename.toLowerCase().includes(normalized) ||
      slide.id.toLowerCase().includes(normalized) ||
      getSlideNumber(slide).toLowerCase().includes(normalized) ||
      getSlideAnatomy(slide).toLowerCase().includes(normalized);
    const matchesAnatomy = selectedAnatomy === 'all' || getSlideAnatomy(slide) === selectedAnatomy;
    const matchesStain = selectedStain === 'all' || getSlideStain(slide) === selectedStain;
    const matchesPrediction = selectedPrediction === 'all' || getSlideStatus(slide) === selectedPrediction;

    return matchesSearch && matchesAnatomy && matchesStain && matchesPrediction;
  });

  const anatomyOptions = ['all', ...Array.from(new Set(slides.map((slide) => getSlideAnatomy(slide))))];
  const stainOptions = ['all', ...Array.from(new Set(slides.map((slide) => getSlideStain(slide))))];

  useEffect(() => {
    async function bootstrap() {
      const requestId = nextLoadRequestId();

      try {
        setSlidesLoading(true);
        setPanelBusy(true);
        setLoadingMessage('正在加载切片目录');
        const slideList = await listSlides();
        if (requestId !== activeLoadRequestRef.current) {
          return;
        }

        setSlides(slideList);
        if (slideList.length > 0) {
          setSlidesLoading(false);
          void loadSlide(slideList[0].id);
        } else {
          setCurrentSlide(null);
          setSlidesLoading(false);
          setPanelBusy(false);
          setLoadingMessage('未发现可用切片');
        }
      } catch (error) {
        if (requestId === activeLoadRequestRef.current) {
          setSlidesLoading(false);
          setPanelBusy(false);
          setLoadingMessage(error instanceof Error ? error.message : '接口加载失败');
        }
      }
    }

    void bootstrap();
  }, []);

  async function loadSlide(slideId: string) {
    const requestId = nextLoadRequestId();

    setPanelBusy(true);
    setLoadingMessage('正在读取切片摘要');
    setZoomText('--');
    setCoordinateText('X: ---% | Y: ---%');

    try {
      const detail = await getSlide(slideId);
      if (requestId !== activeLoadRequestRef.current) {
        return;
      }

      setCurrentSlide(detail);
      setLoadingMessage(detail.diagnosis ? '基于预提取特征和 AttentionMIL 权重生成' : '该切片尚未生成特征和 patch 坐标');
    } catch (error) {
      if (requestId === activeLoadRequestRef.current) {
        setLoadingMessage(error instanceof Error ? error.message : '切片加载失败');
      }
    } finally {
      if (requestId === activeLoadRequestRef.current) {
        setPanelBusy(false);
      }
    }
  }

  function resetView() {
    viewerRef.current?.fitToWindow();
    setZoomText('--');
    setCoordinateText('X: ---% | Y: ---%');
  }

  function goHome() {
    viewerRef.current?.goHome();
    setCoordinateText('X: ---% | Y: ---%');
  }

  function focusOnSuspiciousRegion(region: { x: number; y: number; width: number; height: number }) {
    viewerRef.current?.focusOnRegion(region);
  }

  function handleOpenLocalFile() {
    fileInputRef.current?.click();
  }

  async function handleLocalFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const matchedSlide = slides.find((slide) => slide.filename.toLowerCase() === file.name.toLowerCase());
    if (matchedSlide) {
      setSearch(matchedSlide.filename);
      await loadSlide(matchedSlide.id);
      return;
    }

    window.alert('当前版本先通过 NestJS API 调用已索引切片。若要支持任意新切片上传，需要再接入异步预处理流水线。');
  }

  const summaryState = currentSlide?.status ?? 'pending';
  const warningSummary = currentSlide?.diagnosis?.warning_summary;
  const suspiciousFoci = warningSummary?.foci ?? [];
  const aiSelections = inferBreastPanelSelections(currentSlide);
  const subtypeInteractionDisabled = summaryState !== 'positive' || panelBusy;
  const shouldShowRoiModule = summaryState === 'positive';

  useEffect(() => {
    setSelectedInvasiveType(aiSelections.invasiveType);
    setSelectedGrade(aiSelections.grade);
    setSelectedOtherTypes(aiSelections.others);
    setReportEditable(false);
    setReportDirty(false);
  }, [currentSlide?.id]);

  useEffect(() => {
    if (!reportDirty) {
      setReportText(buildBreastReport(currentSlide, selectedInvasiveType, selectedGrade, selectedOtherTypes));
    }
  }, [currentSlide, selectedGrade, selectedInvasiveType, selectedOtherTypes, reportDirty]);

  function toggleOtherType(optionId: string) {
    setSelectedOtherTypes((current) =>
      current.includes(optionId) ? current.filter((item) => item !== optionId) : [...current, optionId],
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-slate-100 text-slate-800">
      <header className="z-20 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white px-6 shadow-soft">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="JXDA AI"
            width={80}
            height={24}
            className="h-6 w-auto mt-[-6px] object-contain"
            priority
          />

          <h1 className="mt-[2px] font-display text-lg font-bold tracking-tight text-slate-900">
            数字病理辅助诊断系统
          </h1>

          <Badge variant="secondary" className="px-2 py-0.5">
            Pro
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
          <span>Dr. Wang Shuai</span>
          <div className="grid h-8 w-8 place-items-center rounded-full border border-slate-300 bg-slate-200 text-slate-400">
            <UserRound className="h-4 w-4" />
          </div>
        </div>
      </header>

      <main
        className="grid h-[calc(100vh-72px)] overflow-hidden max-[1100px]:h-auto max-[1100px]:grid-cols-1"
        style={{ gridTemplateColumns: sidebarCollapsed ? '48px minmax(0,1fr) 360px' : '320px minmax(0,1fr) 360px' }}
      >
        <aside className="flex min-h-0 flex-col overflow-hidden border-r border-slate-200 bg-[linear-gradient(180deg,#fdfefe_0%,#f5f7fa_100%)] shadow-[4px_0_20px_-10px_rgba(15,23,42,0.12)] transition-[width] duration-300 max-[1100px]:border-r-0">
          {sidebarCollapsed ? (
            <div className="flex flex-1 flex-col items-center justify-start gap-3 border-b border-slate-200/80 py-4">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 flex-shrink-0 rounded-full border-slate-300 bg-white shadow-sm"
                onClick={() => setSidebarCollapsed((current) => !current)}
                aria-label={sidebarCollapsed ? '展开切片侧边栏' : '收起切片侧边栏'}
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 shadow-sm [writing-mode:vertical-rl]">
                切片列表
              </span>
            </div>
          ) : (
            <>
              <input ref={fileInputRef} type="file" accept=".svs,.tif,.tiff,.ndpi,.mrxs" hidden onChange={handleLocalFile} />

              <div className="shrink-0 border-b border-slate-200/80 p-3 pb-0">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-display text-sm font-bold text-slate-800">最近查看</h2>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-2 py-0 text-[11px] font-semibold text-slate-500">
                      {filteredSlides.length} 项
                    </Badge>
                    {/* <Sparkles className="h-3.5 w-3.5 text-rose-400" /> */}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 flex-shrink-0 rounded-full border-slate-300 bg-white shadow-sm"
                    onClick={() => setSidebarCollapsed((current) => !current)}
                    aria-label={sidebarCollapsed ? '展开切片侧边栏' : '收起切片侧边栏'}
                  >
                    {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="mb-3 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索切片编号或文件名" className="h-auto border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0" />
                </div>

                <div className="mb-4 grid grid-cols-1 gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={selectedAnatomy}
                      onChange={(event) => setSelectedAnatomy(event.target.value)}
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 outline-none transition focus:border-slate-300"
                    >
                      <option value="all">切片部位</option>
                      {anatomyOptions.filter((option) => option !== 'all').map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedStain}
                      onChange={(event) => setSelectedStain(event.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 outline-none transition focus:border-slate-300"
                    >
                      <option value="all">切片类型</option>
                      {stainOptions.filter((option) => option !== 'all').map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedPrediction}
                      onChange={(event) => setSelectedPrediction(event.target.value as 'all' | 'positive' | 'negative' | 'pending')}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 outline-none transition focus:border-slate-300"
                    >
                      <option value="all">预测结果</option>
                      <option value="positive">有癌</option>
                      <option value="negative">无癌</option>
                      <option value="pending">分析中</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="scrollbar-subtle flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
                {slidesLoading ? (
                  <SlideListSkeleton />
                ) : filteredSlides.length > 0 ? (
                  <ul className="space-y-3 pb-3">
                    {filteredSlides.map((slide) => (
                      <SlideSidebarCard
                        key={slide.id}
                        slide={slide}
                        active={currentSlide?.id === slide.id}
                        onSelect={() => void loadSlide(slide.id)}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 px-4 py-8 text-center shadow-sm">
                    <p className="text-sm font-semibold text-slate-700">没有匹配的切片</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">请调整搜索关键词或顶部筛选条件。</p>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        <section className="flex min-w-0 flex-col bg-slate-50/50 p-5 max-[1100px]:order-2">
          <div className="mb-3 flex items-center justify-between border-b border-slate-200/80 pb-2.5 max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-2">
            <div className="flex min-w-0 items-center text-sm">
              <span className="text-slate-500">视图工作区</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="inline-flex min-w-0 items-center gap-2 font-medium text-slate-800">
                <Eye className="h-4 w-4 flex-shrink-0 text-blue-500" />
                <span className="truncate">{currentSlide?.filename ?? '--'}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm max-[720px]:w-full">
              <div className="inline-flex items-center gap-2 text-slate-600">
                <span>AI热力</span>
                <button
                  type="button"
                  aria-pressed={heatmapOn}
                  onClick={() => setHeatmapOn((current) => !current)}
                  className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', heatmapOn ? 'bg-blue-600' : 'bg-slate-300')}
                >
                  <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', heatmapOn ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              </div>

              <div className="h-4 w-px bg-slate-300 max-[720px]:hidden" />

              <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                <span>低</span>
                <div className="h-2 w-24 rounded-full bg-[linear-gradient(90deg,#ffd60a_0%,#ffa726_35%,#ff7043_65%,#e53935_82%,#8b0000_100%)]" />
                <span>高</span>
              </div>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-inner shadow-slate-300/30">
            <div className="he-stain-bg absolute inset-0" />
            {currentSlide ? (
              <WsiViewer
                ref={viewerRef}
                slide={currentSlide}
                heatmapOn={heatmapOn}
                heatmapOpacity={heatmapOpacity}
                onZoomChange={(zoom) => setZoomText(`${zoom.toFixed(2)}x`)}
                onCoordinateChange={setCoordinateText}
                rulerMode={rulerMode}
              />
            ) : null}

            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30">
              <div className="absolute left-[-16px] top-1/2 h-px w-8 bg-slate-800" />
              <div className="absolute left-1/2 top-[-16px] h-8 w-px bg-slate-800" />
            </div>

            <div className="absolute bottom-4 left-4 flex gap-2">
              <div className="rounded bg-slate-900/80 px-3 py-1.5 font-display text-xs text-white shadow-lg">Zoom: {zoomText}</div>
              <div className="rounded bg-slate-900/80 px-3 py-1.5 font-display text-xs text-white shadow-lg">{coordinateText}</div>
            </div>

            <div className="absolute bottom-4 right-4 flex gap-2 max-[720px]:bottom-16 max-[720px]:left-4 max-[720px]:right-auto max-[720px]:flex-wrap">
              {/* <Button onClick={resetView} className="rounded-md bg-slate-900 text-sm hover:bg-slate-950">适配窗口</Button> */}
              <Button
                onClick={() => {
                  setRulerMode((v) => {
                    if (v) viewerRef.current?.clearRuler();
                    return !v;
                  });
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md text-sm',
                  rulerMode
                    ? 'bg-yellow-400 text-slate-900 hover:bg-yellow-300'
                    : 'bg-slate-900 text-white hover:bg-slate-950',
                )}
              >
                <Ruler className="h-3.5 w-3.5" />
                测距
              </Button>
              <Button onClick={goHome} className="rounded-md bg-slate-900 text-sm hover:bg-slate-950">回到全图</Button>
            </div>
          </div>
        </section>

        <aside className="relative flex min-h-0 flex-col border-l border-slate-200 bg-white shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] max-[1100px]:order-3 max-[1100px]:border-l-0">
          <div className="shrink-0 border-b border-slate-100 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-800">实时诊断面板</h2>
                {/* <p className="mt-1 text-xs text-slate-500">{loadingMessage}</p> */}
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold',
                  summaryState === 'positive'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : summaryState === 'negative'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700',
                )}
              >
                {summaryState === 'positive' ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                <span>{getStatusText(summaryState)}</span>
              </Badge>
            </div>
          </div>

          <div className="scrollbar-subtle flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">AI 亚型预测</h3>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    浸润性癌
                    {aiSelections.invasiveType ? <sup className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold leading-none text-red-600">AI</sup> : null}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {INVASIVE_TYPE_OPTIONS.map((option) => (
                      <DiagnosticChoiceChip
                        key={option.id}
                        label={option.label}
                        selected={selectedInvasiveType === option.id}
                        aiHigh={aiSelections.invasiveType === option.id}
                        disabled={subtypeInteractionDisabled}
                        onClick={() => setSelectedInvasiveType(option.id)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Nottingham Grade
                    {aiSelections.grade ? <sup className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold leading-none text-red-600">AI</sup> : null}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {GRADE_OPTIONS.map((option) => (
                      <DiagnosticChoiceChip
                        key={option.id}
                        label={option.label}
                        selected={selectedGrade === option.id}
                        disabled={subtypeInteractionDisabled}
                        onClick={() => setSelectedGrade(option.id)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    原位癌及其它
                    {aiSelections.others.length > 0 ? <sup className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold leading-none text-red-600">AI</sup> : null}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {OTHER_TYPE_OPTIONS.map((option) => (
                      <DiagnosticChoiceChip
                        key={option.id}
                        label={option.label}
                        selected={selectedOtherTypes.includes(option.id)}
                        disabled={subtypeInteractionDisabled}
                        onClick={() => toggleOtherType(option.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {summaryState !== 'positive' ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-3 text-xs leading-5 text-slate-500">
                  {summaryState === 'negative'
                    ? '当前切片 AI 判定为阴性，亚型预测按钮已置灰，切片报告将默认填充阴性模版文本。'
                    : 'AI 推理尚未完成，待模型输出后再开放乳腺癌亚型修正交互。'}
                </div>
              ) : null}
            </section>

            {shouldShowRoiModule ? (
              <>
                <hr className="border-slate-100" />
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">疑似灶定位</h3>
                    <p className="mt-0.5 text-xs text-slate-500">点击下方缩略图可进行快速定位。</p>
                  </div>
                  <Badge variant="outline" className="whitespace-nowrap border-slate-200 bg-slate-50 text-[11px] text-slate-600">
                    共发现 {suspiciousFoci.length} 个
                  </Badge>
                </div>

                {suspiciousFoci.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {suspiciousFoci.map((focus) => (
                      <button
                        key={focus.id}
                        type="button"
                        onClick={() => focusOnSuspiciousRegion(focus)}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition-all hover:bg-white"
                      >
                        <div className="relative aspect-square w-full overflow-hidden bg-slate-200">
                          <img
                            src={getSlideFocusRoiUrl(currentSlide!.id, focus)}
                            alt={`疑似灶 ${focus.id}`}
                            className="h-full w-full object-cover transition-opacity"
                            loading="lazy"
                          />
                          <span className="absolute inset-x-0 bottom-0 bg-slate-950/55 px-1 py-1 text-center text-[11px] font-semibold text-white">
                            ROI {focus.id}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                    当前未检出可定位的疑似灶。
                  </div>
                )}
              </section>
              </>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4 shadow-[0_-10px_24px_-20px_rgba(15,23,42,0.35)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800">切片报告</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-600"
                onClick={() => setReportEditable((current) => !current)}
                disabled={!currentSlide}
              >
                <PencilLine className="mr-1 h-3.5 w-3.5" />
                {reportEditable ? '完成' : '编辑'}
              </Button>
            </div>

            <textarea
              value={reportText}
              readOnly={!reportEditable}
              onChange={(event) => {
                setReportDirty(true);
                setReportText(event.target.value);
              }}
              className={cn(
                'mb-4 h-28 w-full resize-none rounded-xl border px-3 py-3 text-sm leading-6 outline-none',
                reportEditable
                  ? 'border-slate-300 bg-white text-slate-700 focus:border-blue-400'
                  : 'border-slate-200 bg-slate-100 text-slate-600',
              )}
            />

            <Button className="w-full rounded-md bg-slate-800 hover:bg-slate-900" onClick={() => window.print()}>
              导出 PDF 报告
            </Button>
          </div>

          {panelBusy ? (
            <div className="pointer-events-none absolute inset-0 z-10 bg-white/70 px-5 py-4 backdrop-blur-[1px]">
              <div className="flex h-full flex-col gap-5">
                <div className="flex flex-col gap-3 animate-pulse">
                  <div className="h-4 w-24 rounded bg-slate-200" />
                  <div className="mt-1 flex flex-col gap-3">
                    <div>
                      <div className="mb-2 h-3 w-16 rounded-full bg-slate-200" />
                      <div className="grid grid-cols-2 gap-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <div key={i} className="h-8 rounded-lg bg-slate-200" />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 h-3 w-28 rounded-full bg-slate-200" />
                      <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="h-8 rounded-lg bg-slate-200" />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 h-3 w-20 rounded-full bg-slate-200" />
                      <div className="grid grid-cols-2 gap-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <div key={i} className="h-8 rounded-lg bg-slate-200" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 animate-pulse">
                  <div className="h-4 w-20 rounded bg-slate-200" />
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="aspect-square rounded-lg bg-slate-200" />
                    ))}
                  </div>
                </div>

                <div className="mt-auto flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 animate-pulse">
                  <div className="h-3.5 w-16 rounded bg-slate-200" />
                  <div className="h-20 rounded-lg bg-slate-200" />
                  <div className="h-9 rounded-lg bg-slate-200" />
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </main>
    </div>
  );
}