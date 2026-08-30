
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const MAP_WIDTH = 3919;
const MAP_HEIGHT = 4251;
const TOTAL_LOCATIONS = 150;

const INITIAL_MARKERS = [];

function getMarkerNumber(id) {
  return "#" + String(id).padStart(3, "0");
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        const maxWidth = 1600;
        const maxHeight = 1600;

        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(
            maxWidth / width,
            maxHeight / height
          );

          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Canvas를 생성할 수 없습니다."));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };

      img.onerror = () => {
        reject(new Error("이미지를 불러올 수 없습니다."));
      };

      if (typeof event.target?.result === "string") {
        img.src = event.target.result;
      } else {
        reject(new Error("이미지 데이터를 읽을 수 없습니다."));
      }
    };

    reader.onerror = () => {
      reject(new Error("파일을 읽을 수 없습니다."));
    };

    reader.readAsDataURL(file);
  });
}

function normalizeMarkers(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((marker, index) => {
      const id = Number(marker.id);

      return {
        id: Number.isFinite(id) ? id : index + 1,

        x: Number.isFinite(Number(marker.x))
          ? Number(marker.x)
          : 0,

        y: Number.isFinite(Number(marker.y))
          ? Number(marker.y)
          : 0,

        description: marker.description || "",

        nickname: marker.nickname || "",

        locationImage:
          marker.location_image ||
          marker.locationImage ||
          "",

        mapImage:
          marker.map_image ||
          marker.mapImage ||
          "",

        discovered: Boolean(marker.discovered),
      };
    })
    .filter(
      (marker) =>
        marker.x >= 0 &&
        marker.x <= 100 &&
        marker.y >= 0 &&
        marker.y <= 100
    );
}

function createClusters(markers, scale) {
  if (!markers || markers.length === 0) {
    return [];
  }

  let distance = 0.45;

  if (scale < 1.2) {
    distance = 3.2;
  } else if (scale < 1.8) {
    distance = 2.3;
  } else if (scale < 2.5) {
    distance = 1.5;
  } else if (scale < 3.5) {
    distance = 0.9;
  }

  const clusters = [];
  const used = new Set();

  markers.forEach((marker) => {
    if (used.has(marker.id)) {
      return;
    }

    const group = [marker];
    used.add(marker.id);

    markers.forEach((other) => {
      if (used.has(other.id)) {
        return;
      }

      const dx = marker.x - other.x;
      const dy = marker.y - other.y;

      const currentDistance = Math.sqrt(
        dx * dx + dy * dy
      );

      if (currentDistance <= distance) {
        group.push(other);
        used.add(other.id);
      }
    });

    let centerX = 0;
    let centerY = 0;

    group.forEach((item) => {
      centerX += item.x;
      centerY += item.y;
    });

    centerX /= group.length;
    centerY /= group.length;

    clusters.push({
      id: "cluster-" + marker.id,
      x: centerX,
      y: centerY,
      markers: group,
      count: group.length,
    });
  });

  return clusters;
}

function App() {
  const mapAreaRef = useRef(null);

  const [mapAreaSize, setMapAreaSize] = useState({
    width: 1000,
    height: 700,
  });

  const [scale, setScale] = useState(1);

  const [position, setPosition] = useState({
    x: 0,
    y: 0,
  });

  const [markers, setMarkers] = useState(INITIAL_MARKERS);

  const [loadingMarkers, setLoadingMarkers] = useState(true);

  const [selectedMarker, setSelectedMarker] = useState(null);

  const [search, setSearch] = useState("");

  const [activeFilter, setActiveFilter] = useState("all");

  const [editingDescription, setEditingDescription] = useState("");

  const [editingLocationImage, setEditingLocationImage] = useState("");

  const [editingMapImage, setEditingMapImage] = useState("");

  const [isAddingMarker, setIsAddingMarker] = useState(false);

  const [pasteTarget, setPasteTarget] = useState(null);

  const [toast, setToast] = useState("");

  const [largeImage, setLargeImage] = useState(null);

  const [dragging, setDragging] = useState(false);

  const [dragStart, setDragStart] = useState({
    x: 0,
    y: 0,
  });

  const [startPosition, setStartPosition] = useState({
    x: 0,
    y: 0,
  });

  const [didDrag, setDidDrag] = useState(false);

  const showToast = (message) => {
    setToast(message);

    window.setTimeout(() => {
      setToast("");
    }, 2200);
  };

  useEffect(() => {
    let mounted = true;

    async function loadMarkers() {
      try {
        setLoadingMarkers(true);

        const { data, error } = await supabase
          .from("markers")
          .select(
            "id,x,y,description,nickname,location_image,map_image,discovered"
          )
          .order("id", {
            ascending: true,
          });

        if (error) {
          throw error;
        }

        if (mounted) {
          setMarkers(normalizeMarkers(data));
        }
      } catch (error) {
        console.error(
          "Supabase 마커 불러오기 오류:",
          error
        );

        if (mounted) {
          showToast(
            "온라인 위치 데이터를 불러오지 못했습니다."
          );
        }
      } finally {
        if (mounted) {
          setLoadingMarkers(false);
        }
      }
    }

    loadMarkers();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("kurur-markers")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "markers",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming =
              normalizeMarkers([payload.new])[0];

            if (!incoming) {
              return;
            }

            setMarkers((prev) => {
              const exists = prev.some(
                (marker) => marker.id === incoming.id
              );

              if (exists) {
                return prev.map((marker) =>
                  marker.id === incoming.id
                    ? incoming
                    : marker
                );
              }

              return [...prev, incoming].sort(
                (a, b) => a.id - b.id
              );
            });
          }

          if (payload.eventType === "UPDATE") {
            const incoming =
              normalizeMarkers([payload.new])[0];

            if (!incoming) {
              return;
            }

            setMarkers((prev) =>
              prev.map((marker) =>
                marker.id === incoming.id
                  ? incoming
                  : marker
              )
            );

            setSelectedMarker((current) =>
              current &&
              current.id === incoming.id
                ? incoming
                : current
            );
          }

          if (payload.eventType === "DELETE") {
            const deletedId = Number(
              payload.old?.id
            );

            setMarkers((prev) =>
              prev.filter(
                (marker) => marker.id !== deletedId
              )
            );

            setSelectedMarker((current) =>
              current &&
              current.id === deletedId
                ? null
                : current
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    function updateSize() {
      if (!mapAreaRef.current) {
        return;
      }

      const rect =
        mapAreaRef.current.getBoundingClientRect();

      setMapAreaSize({
        width: rect.width,
        height: rect.height,
      });
    }

    updateSize();

    window.addEventListener(
      "resize",
      updateSize
    );

    return () => {
      window.removeEventListener(
        "resize",
        updateSize
      );
    };
  }, []);

  useEffect(() => {
    async function handlePaste(event) {
      if (!pasteTarget) {
        return;
      }

      const items =
        event.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (
          item.type &&
          item.type.startsWith("image/")
        ) {
          const file = item.getAsFile();

          if (!file) {
            showToast("사진을 읽을 수 없습니다.");
            return;
          }

          event.preventDefault();

          try {
            showToast(
              "사진을 처리하고 있습니다..."
            );

            const compressed =
              await compressImage(file);

            if (pasteTarget === "location") {
              setEditingLocationImage(
                compressed
              );

              showToast(
                "위치사진이 추가되었습니다."
              );
            }

            if (pasteTarget === "map") {
              setEditingMapImage(
                compressed
              );

              showToast(
                "지도사진이 추가되었습니다."
              );
            }

            setPasteTarget(null);
          } catch (error) {
            console.error(
              "사진 처리 오류:",
              error
            );

            showToast(
              "사진 처리 중 오류가 발생했습니다."
            );
          }

          return;
        }
      }

      showToast(
        "클립보드에 이미지가 없습니다."
      );
    }

    window.addEventListener(
      "paste",
      handlePaste
    );

    return () => {
      window.removeEventListener(
        "paste",
        handlePaste
      );
    };
  }, [pasteTarget]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== "Escape") {
        return;
      }

      setLargeImage(null);
      setPasteTarget(null);
      setIsAddingMarker(false);
      setDragging(false);
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, []);

  const mapRatio =
    MAP_WIDTH / MAP_HEIGHT;

  let displayedMapWidth =
    mapAreaSize.width;

  let displayedMapHeight =
    mapAreaSize.height;

  if (
    mapAreaSize.width /
      mapAreaSize.height >
    mapRatio
  ) {
    displayedMapHeight =
      mapAreaSize.height;

    displayedMapWidth =
      displayedMapHeight * mapRatio;
  } else {
    displayedMapWidth =
      mapAreaSize.width;

    displayedMapHeight =
      displayedMapWidth / mapRatio;
  }

  const openMarker = (marker) => {
    setSelectedMarker(marker);

    setEditingDescription(
      marker.description || ""
    );

    setEditingLocationImage(
      marker.locationImage || ""
    );

    setEditingMapImage(
      marker.mapImage || ""
    );

    setPasteTarget(null);
    setIsAddingMarker(false);
  };

  const focusMarker = (marker) => {
    const markerX =
      (marker.x / 100) *
      displayedMapWidth;

    const markerY =
      (marker.y / 100) *
      displayedMapHeight;

    const targetScale = 3;

    const targetX =
      -(
        markerX -
        displayedMapWidth / 2
      ) *
      targetScale;

    const targetY =
      -(
        markerY -
        displayedMapHeight / 2
      ) *
      targetScale;

    setScale(targetScale);

    setPosition({
      x: targetX,
      y: targetY,
    });

    openMarker(marker);

    showToast(
      getMarkerNumber(marker.id) +
        " 위치로 이동했습니다."
    );
  };

  const startAddMarker = () => {
    setSelectedMarker(null);
    setIsAddingMarker(true);

    showToast(
      "지도에서 원하는 위치를 클릭하세요."
    );
  };

  const handleMapClick = (event) => {
    if (!isAddingMarker) {
      return;
    }

    if (didDrag) {
      return;
    }

    const rect =
      event.currentTarget.getBoundingClientRect();

    const clickX =
      event.clientX - rect.left;

    const clickY =
      event.clientY - rect.top;

    const imageX =
      displayedMapWidth / 2 +
      (
        clickX -
        mapAreaSize.width / 2 -
        position.x
      ) /
        scale;

    const imageY =
      displayedMapHeight / 2 +
      (
        clickY -
        mapAreaSize.height / 2 -
        position.y
      ) /
        scale;

    const x =
      (imageX /
        displayedMapWidth) *
      100;

    const y =
      (imageY /
        displayedMapHeight) *
      100;

    if (
      x < 0 ||
      x > 100 ||
      y < 0 ||
      y > 100
    ) {
      showToast(
        "지도 이미지 안쪽을 클릭해주세요."
      );

      return;
    }

    let maxId = 0;

    markers.forEach((marker) => {
      const id =
        Number(marker.id) || 0;

      if (id > maxId) {
        maxId = id;
      }
    });

    const newMarker = {
      id: maxId + 1,
      x,
      y,
      description: "",
      nickname: "",
      locationImage: "",
      mapImage: "",
      discovered: false,
    };

    setMarkers((prev) => [
      ...prev,
      newMarker,
    ]);

    setSelectedMarker(newMarker);

    setEditingDescription("");
    setEditingLocationImage("");
    setEditingMapImage("");

    setPasteTarget(null);
    setIsAddingMarker(false);

    async function saveNewMarker() {
      try {
        showToast(
          "위치를 저장하고 있습니다..."
        );

        const { error } =
          await supabase
            .from("markers")
            .insert({
              id: newMarker.id,
              x: newMarker.x,
              y: newMarker.y,
              description: "",
              nickname: "",
              location_image: "",
              map_image: "",
              discovered: false,
            });

        if (error) {
          throw error;
        }

        showToast(
          getMarkerNumber(
            newMarker.id
          ) +
            " 위치가 저장되었습니다."
        );
      } catch (error) {
        console.error(
          "마커 추가 오류:",
          error
        );

        setMarkers((prev) =>
          prev.filter(
            (marker) =>
              marker.id !==
              newMarker.id
          )
        );

        setSelectedMarker(null);

        showToast(
          "위치 저장에 실패했습니다."
        );
      }
    }

    saveNewMarker();
  };

  const uploadImage = async (
    dataUrl,
    markerId,
    type
  ) => {
    if (!dataUrl) {
      return "";
    }

    if (
      dataUrl.startsWith("http://") ||
      dataUrl.startsWith("https://")
    ) {
      return dataUrl;
    }

    const response =
      await fetch(dataUrl);

    const blob =
      await response.blob();

    const filePath =
      markerId +
      "/" +
      type +
      "-" +
      Date.now() +
      ".jpg";

    const {
      error: uploadError,
    } =
      await supabase.storage
        .from("location-images")
        .upload(
          filePath,
          blob,
          {
            contentType:
              "image/jpeg",
            upsert: true,
          }
        );

    if (uploadError) {
      throw uploadError;
    }

    const {
      data: publicData,
    } =
      supabase.storage
        .from("location-images")
        .getPublicUrl(
          filePath
        );

    return (
      publicData?.publicUrl || ""
    );
  };

  const saveMarker = async () => {
    if (!selectedMarker) {
      return;
    }

    try {
      showToast(
        "저장하고 있습니다..."
      );

      const locationImage =
        await uploadImage(
          editingLocationImage,
          selectedMarker.id,
          "location"
        );

      const mapImage =
        await uploadImage(
          editingMapImage,
          selectedMarker.id,
          "map"
        );

      const updatedMarker = {
        ...selectedMarker,
        description:
          editingDescription,
        locationImage,
        mapImage,
      };

      const { error } =
        await supabase
          .from("markers")
          .update({
            description:
              updatedMarker.description,
            location_image:
              updatedMarker.locationImage,
            map_image:
              updatedMarker.mapImage,
          })
          .eq(
            "id",
            selectedMarker.id
          );

      if (error) {
        throw error;
      }

      setMarkers((prev) =>
        prev.map((marker) =>
          marker.id ===
          selectedMarker.id
            ? updatedMarker
            : marker
        )
      );

      setSelectedMarker(
        updatedMarker
      );

      setEditingLocationImage(
        locationImage
      );

      setEditingMapImage(
        mapImage
      );

      showToast(
        getMarkerNumber(
          selectedMarker.id
        ) +
          " 저장되었습니다."
      );
    } catch (error) {
      console.error(
        "마커 저장 오류:",
        error
      );

      showToast(
        "저장에 실패했습니다."
      );
    }
  };

  const toggleDiscovered = async () => {
    if (!selectedMarker) {
      return;
    }

    const nextDiscovered =
      !selectedMarker.discovered;

    const updatedMarker = {
      ...selectedMarker,
      discovered:
        nextDiscovered,
    };

    setSelectedMarker(
      updatedMarker
    );

    setMarkers((prev) =>
      prev.map((marker) =>
        marker.id ===
        updatedMarker.id
          ? updatedMarker
          : marker
      )
    );

    try {
      const { error } =
        await supabase
          .from("markers")
          .update({
            discovered:
              nextDiscovered,
          })
          .eq(
            "id",
            updatedMarker.id
          );

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error(
        "발견 상태 저장 오류:",
        error
      );

      setSelectedMarker(
        selectedMarker
      );

      setMarkers((prev) =>
        prev.map((marker) =>
          marker.id ===
          selectedMarker.id
            ? selectedMarker
            : marker
        )
      );

      showToast(
        "발견 상태 저장에 실패했습니다."
      );
    }
  };

  const deleteMarker = async () => {
    if (!selectedMarker) {
      return;
    }

    const confirmed =
      window.confirm(
        getMarkerNumber(
          selectedMarker.id
        ) +
          " 위치를 삭제할까요?"
      );

    if (!confirmed) {
      return;
    }

    const deletingId =
      selectedMarker.id;

    try {
      const { error } =
        await supabase
          .from("markers")
          .delete()
          .eq(
            "id",
            deletingId
          );

      if (error) {
        throw error;
      }

      setMarkers((prev) =>
        prev.filter(
          (marker) =>
            marker.id !==
            deletingId
        )
      );

      setSelectedMarker(null);

      showToast(
        "위치가 삭제되었습니다."
      );
    } catch (error) {
      console.error(
        "마커 삭제 오류:",
        error
      );

      showToast(
        "위치 삭제에 실패했습니다."
      );
    }
  };

  const zoomIn = () => {
    setScale((prev) =>
      Math.min(
        Number(
          (prev + 0.2).toFixed(2)
        ),
        5
      )
    );
  };

  const zoomOut = () => {
    setScale((prev) =>
      Math.max(
        Number(
          (prev - 0.2).toFixed(2)
        ),
        0.5
      )
    );
  };

  const resetMap = () => {
    setScale(1);

    setPosition({
      x: 0,
      y: 0,
    });
  };

  const handleWheel = (event) => {
    event.preventDefault();

    if (event.deltaY < 0) {
      setScale((prev) =>
        Math.min(
          Number(
            (prev + 0.15).toFixed(2)
          ),
          5
        )
      );
    } else {
      setScale((prev) =>
        Math.max(
          Number(
            (prev - 0.15).toFixed(2)
          ),
          0.5
        )
      );
    }
  };

  const handleMouseDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    if (isAddingMarker) {
      setDidDrag(false);
      return;
    }

    setDragging(true);
    setDidDrag(false);

    setDragStart({
      x: event.clientX,
      y: event.clientY,
    });

    setStartPosition({
      x: position.x,
      y: position.y,
    });
  };

  const handleMouseMove = (event) => {
    if (!dragging) {
      return;
    }

    const dx =
      event.clientX -
      dragStart.x;

    const dy =
      event.clientY -
      dragStart.y;

    if (
      Math.abs(dx) > 4 ||
      Math.abs(dy) > 4
    ) {
      setDidDrag(true);
    }

    setPosition({
      x:
        startPosition.x + dx,
      y:
        startPosition.y + dy,
    });
  };

  const stopDragging = () => {
    setDragging(false);
  };

  const discoveredCount =
    markers.filter(
      (marker) =>
        marker.discovered
    ).length;

  const photoCount =
    markers.filter(
      (marker) =>
        Boolean(
          marker.locationImage ||
          marker.mapImage
        )
    ).length;

  const filteredMarkers =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      return markers.filter(
        (marker) => {
          const number =
            String(
              marker.id
            ).padStart(3, "0");

          const description =
            String(
              marker.description ||
                ""
            ).toLowerCase();

          const matchesSearch =
            keyword === "" ||
            number.includes(
              keyword
            ) ||
            String(
              marker.id
            ).includes(
              keyword
            ) ||
            description.includes(
              keyword
            );

          let matchesFilter =
            true;

          if (
            activeFilter ===
            "discovered"
          ) {
            matchesFilter =
              marker.discovered;
          }

          if (
            activeFilter ===
            "undiscovered"
          ) {
            matchesFilter =
              !marker.discovered;
          }

          if (
            activeFilter ===
            "photo"
          ) {
            matchesFilter =
              Boolean(
                marker.locationImage ||
                marker.mapImage
              );
          }

          if (
            activeFilter ===
            "hide-discovered"
          ) {
            matchesFilter =
              !marker.discovered;
          }

          return (
            matchesSearch &&
            matchesFilter
          );
        }
      );
    }, [
      markers,
      search,
      activeFilter,
    ]);

  const clusters = useMemo(
    () =>
      createClusters(
        filteredMarkers,
        scale
      ),
    [filteredMarkers, scale]
  );

  const handleClusterClick = (
    event,
    cluster
  ) => {
    event.stopPropagation();

    if (cluster.count === 1) {
      openMarker(
        cluster.markers[0]
      );
      return;
    }

    const nextScale =
      Math.min(
        Number(
          (scale + 0.8).toFixed(2)
        ),
        5
      );

    const clusterX =
      (cluster.x / 100) *
      displayedMapWidth;

    const clusterY =
      (cluster.y / 100) *
      displayedMapHeight;

    const targetX =
      -(
        clusterX -
        displayedMapWidth / 2
      ) *
      nextScale;

    const targetY =
      -(
        clusterY -
        displayedMapHeight / 2
      ) *
      nextScale;

    setScale(nextScale);

    setPosition({
      x: targetX,
      y: targetY,
    });

    showToast(
      cluster.count +
        "개 위치를 확대했습니다."
    );
  };

  const removeLocationImage =
    () => {
      setEditingLocationImage(
        ""
      );
    };

  const removeMapImage = () => {
    setEditingMapImage("");
  };

  function PhotoBox({
    title,
    image,
    onPaste,
    onRemove,
  }) {
    return (
      <div className="photo-section">
        <div className="photo-title">
          {title}
        </div>

        {image ? (
          <div className="photo-preview">
            <img
              src={image}
              alt={title}
              onClick={() =>
                setLargeImage(image)
              }
            />

            <div className="photo-bottom">
              <button
                type="button"
                onClick={() =>
                  setLargeImage(
                    image
                  )
                }
              >
                🔍 크게 보기
              </button>

              <button
                type="button"
                onClick={onRemove}
              >
                삭제
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="paste-area"
            onClick={onPaste}
          >
            <div className="paste-icon">
              📋
            </div>

            <strong>
              Ctrl + V
            </strong>

            <span>
              사진 붙여넣기
            </span>

            <small>
              먼저 이곳을 클릭한 뒤
              사진을 붙여넣으세요.
            </small>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="app">

      <header className="topbar">

        <div className="title">
          🍯 꾸르르 찾기 지도
        </div>

        <div className="search-box">
          <span>🔎</span>

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="번호 또는 설명 검색..."
          />

          {search && (
            <button
              type="button"
              onClick={() =>
                setSearch("")
              }
            >
              ×
            </button>
          )}
        </div>

        <div className="zoom-buttons">

          <button
            type="button"
            onClick={zoomOut}
          >
            −
          </button>

          <button
            type="button"
            onClick={resetMap}
          >
            {Math.round(
              scale * 100
            )}
            %
          </button>

          <button
            type="button"
            onClick={zoomIn}
          >
            ＋
          </button>

        </div>

      </header>

      <div className="main">

        <aside className="sidebar">

          <h2>
            🍯 꾸르르
          </h2>

          <div className="progress-box">

            <div className="progress-title">
              발견 현황
            </div>

            <div className="progress-number">
              {discoveredCount} /{" "}
              {TOTAL_LOCATIONS}
            </div>

            <div className="progress-bar">

              <div
                className="progress-fill"
                style={{
                  width:
                    Math.min(
                      (
                        discoveredCount /
                        TOTAL_LOCATIONS
                      ) *
                        100,
                      100
                    ) + "%",
                }}
              />

            </div>

            <div className="progress-percent">
              {Math.round(
                (
                  discoveredCount /
                  TOTAL_LOCATIONS
                ) *
                  100
              )}
              %
            </div>

          </div>

          <div className="section-title">
            필터
          </div>

          <button
            type="button"
            className={
              activeFilter === "all"
                ? "filter active"
                : "filter"
            }
            onClick={() =>
              setActiveFilter("all")
            }
          >
            <span>
              전체
            </span>

            <span>
              {markers.length}
            </span>
          </button>

          <button
            type="button"
            className={
              activeFilter ===
              "undiscovered"
                ? "filter active"
                : "filter"
            }
            onClick={() =>
              setActiveFilter(
                "undiscovered"
              )
            }
          >
            <span>
              미발견
            </span>

            <span>
              {
                markers.filter(
                  (marker) =>
                    !marker.discovered
                ).length
              }
            </span>
          </button>

          <button
            type="button"
            className={
              activeFilter ===
              "discovered"
                ? "filter active"
                : "filter"
            }
            onClick={() =>
              setActiveFilter(
                "discovered"
              )
            }
          >
            <span>
              발견함
            </span>

            <span>
              {discoveredCount}
            </span>
          </button>

          <button
            type="button"
            className={
              activeFilter ===
              "photo"
                ? "filter active"
                : "filter"
            }
            onClick={() =>
              setActiveFilter(
                "photo"
              )
            }
          >
            <span>
              📷 사진 있음
            </span>

            <span>
              {photoCount}
            </span>
          </button>

          <button
            type="button"
            className={
              activeFilter ===
              "hide-discovered"
                ? "filter active"
                : "filter"
            }
            onClick={() =>
              setActiveFilter(
                "hide-discovered"
              )
            }
          >
            <span>
              👁️ 발견한 위치 숨기기
            </span>
          </button>

          <div className="section-title location-heading">
            위치 목록
          </div>

          <div className="locations">

            {loadingMarkers && (
              <div className="empty-list">
                온라인 위치를 불러오는 중...
              </div>
            )}

            {!loadingMarkers &&
              filteredMarkers.map(
                (marker) => (
                  <button
                    type="button"
                    key={marker.id}
                    className={
                      selectedMarker &&
                      selectedMarker.id ===
                        marker.id
                        ? "location selected"
                        : "location"
                    }
                    onClick={() =>
                      focusMarker(
                        marker
                      )
                    }
                  >
                    <div className="location-main">

                      <span>
                        {marker.discovered
                          ? "✅"
                          : "🍯"}
                      </span>

                      <b>
                        {getMarkerNumber(
                          marker.id
                        )}
                      </b>

                    </div>

                    <small>

                      {marker.description
                        ? marker.description
                        : "위치 설명 없음"}

                      {" · "}

                      {marker.locationImage ||
                      marker.mapImage
                        ? "📷 사진 있음"
                        : "사진 없음"}

                    </small>

                  </button>
                )
              )}

            {!loadingMarkers &&
              filteredMarkers.length ===
                0 && (
                <div className="empty-list">
                  위치가 없습니다.
                </div>
              )}

          </div>

        </aside>

        <main
          className="map-area"
          ref={mapAreaRef}
        >

          <div
            className={
              isAddingMarker
                ? "map-wrapper adding-mode"
                : "map-wrapper"
            }
            onWheel={handleWheel}
            onMouseDown={
              handleMouseDown
            }
            onMouseMove={
              handleMouseMove
            }
            onMouseUp={
              stopDragging
            }
            onMouseLeave={
              stopDragging
            }
            onClick={
              handleMapClick
            }
          >

            <div
              className="map-content"
              style={{
                width:
                  `${displayedMapWidth}px`,

                height:
                  `${displayedMapHeight}px`,

                position:
                  "absolute",

                left: "50%",

                top: "50%",

                transform:
                  `translate(-50%, -50%) translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,

                transformOrigin:
                  "center center",

                willChange:
                  "transform",

                backfaceVisibility:
                  "hidden",

                WebkitBackfaceVisibility:
                  "hidden",
              }}
            >

              <img
                src="/map.jpg"
                alt="GTA V Map"
                className="map-image"
                draggable={false}
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                decoding="async"
                fetchPriority="high"
              />

              {clusters.map(
                (cluster) => {

                  if (
                    cluster.count === 1
                  ) {
                    const marker =
                      cluster.markers[0];

                    return (
                      <button
                        type="button"
                        key={marker.id}
                        className={
                          marker.discovered
                            ? "marker discovered"
                            : "marker"
                        }
                        style={{
                          left:
                            `${marker.x}%`,

                          top:
                            `${marker.y}%`,
                        }}
                        title={
                          getMarkerNumber(
                            marker.id
                          )
                        }
                        onMouseDown={(
                          event
                        ) => {
                          event.stopPropagation();
                        }}
                        onClick={(
                          event
                        ) => {
                          event.stopPropagation();

                          if (didDrag) {
                            return;
                          }

                          if (
                            isAddingMarker
                          ) {
                            return;
                          }

                          openMarker(
                            marker
                          );
                        }}
                      >

                        <span className="marker-dot">
                          {marker.discovered
                            ? "✓"
                            : ""}
                        </span>

                        <span className="marker-number">
                          {getMarkerNumber(
                            marker.id
                          )}
                        </span>

                      </button>
                    );
                  }

                  return (
                    <button
                      type="button"
                      key={cluster.id}
                      className="marker-cluster"
                      style={{
                        left:
                          `${cluster.x}%`,

                        top:
                          `${cluster.y}%`,
                      }}
                      title={
                        cluster.count +
                        "개 위치"
                      }
                      onMouseDown={(
                        event
                      ) => {
                        event.stopPropagation();
                      }}
                      onClick={(
                        event
                      ) => {
                        event.stopPropagation();

                        if (
                          isAddingMarker
                        ) {
                          return;
                        }

                        handleClusterClick(
                          event,
                          cluster
                        );
                      }}
                    >

                      <span className="cluster-dot">
                        🍯
                      </span>

                      <span className="cluster-count">
                        {cluster.count}
                      </span>

                    </button>
                  );
                }
              )}

            </div>

          </div>

          {isAddingMarker && (
            <div className="adding-banner">

              📍 원하는 위치를
              클릭하세요.

              <button
                type="button"
                onClick={() =>
                  setIsAddingMarker(
                    false
                  )
                }
              >
                취소
              </button>

            </div>
          )}

          {toast && (
            <div className="toast">
              {toast}
            </div>
          )}

          <div className="map-help">

            🖱️ 휠
            <span>
              확대 / 축소
            </span>

            <br />

            🖐️ 드래그
            <span>
              지도 이동
            </span>

            <br />

            🍯 위치
            <span>
              가까운 위치 자동 묶음
            </span>

          </div>

          <button
            type="button"
            className="add-button"
            onClick={
              startAddMarker
            }
          >
            ＋ 위치 추가
          </button>

          {selectedMarker && (
            <div
              className="marker-info"
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
              onClick={(event) =>
                event.stopPropagation()
              }
            >

              <div className="marker-info-header">

                <div>

                  <div className="marker-label">
                    꾸르르 위치
                  </div>

                  <h3>
                    🍯{" "}
                    {getMarkerNumber(
                      selectedMarker.id
                    )}
                  </h3>

                </div>

                <button
                  type="button"
                  className="close-button"
                  onClick={() =>
                    setSelectedMarker(
                      null
                    )
                  }
                >
                  ×
                </button>

              </div>

              <PhotoBox
                title="📷 위치사진"
                image={
                  editingLocationImage
                }
                onPaste={() =>
                  setPasteTarget(
                    "location"
                  )
                }
                onRemove={
                  removeLocationImage
                }
              />

              <PhotoBox
                title="🗺️ 지도사진"
                image={
                  editingMapImage
                }
                onPaste={() =>
                  setPasteTarget(
                    "map"
                  )
                }
                onRemove={
                  removeMapImage
                }
              />

              {pasteTarget && (
                <div className="paste-active">

                  📋 이제{" "}
                  <b>
                    Ctrl + V
                  </b>{" "}
                  를 눌러 사진을
                  붙여넣으세요.

                  <button
                    type="button"
                    onClick={() =>
                      setPasteTarget(
                        null
                      )
                    }
                  >
                    취소
                  </button>

                </div>
              )}

              <div className="form-section">

                <label>
                  📝 위치 설명
                </label>

                <textarea
                  value={
                    editingDescription
                  }
                  onChange={(
                    event
                  ) =>
                    setEditingDescription(
                      event.target.value
                    )
                  }
                  placeholder={
                    "예: 메광 분수대\n건물 뒤쪽에 있습니다."
                  }
                />

              </div>

              <div className="info-row">

                <span>
                  위치 번호
                </span>

                <b>
                  {getMarkerNumber(
                    selectedMarker.id
                  )}
                </b>

              </div>

              <div className="marker-actions">

                <button
                  type="button"
                  className="save-button"
                  onClick={
                    saveMarker
                  }
                >
                  💾 저장
                </button>

                <button
                  type="button"
                  className={
                    selectedMarker.discovered
                      ? "discovered-button active"
                      : "discovered-button"
                  }
                  onClick={
                    toggleDiscovered
                  }
                >
                  {selectedMarker.discovered
                    ? "✓ 발견함"
                    : "○ 발견함"}
                </button>

              </div>

              <button
                type="button"
                className="delete-button"
                onClick={
                  deleteMarker
                }
              >
                🗑️ 위치 삭제
              </button>

            </div>
          )}

          {largeImage && (
            <div
              className="image-modal"
              onClick={() =>
                setLargeImage(null)
              }
            >

              <button
                type="button"
                className="image-modal-close"
                onClick={() =>
                  setLargeImage(null)
                }
              >
                ×
              </button>

              <img
                src={largeImage}
                alt="확대 사진"
                onClick={(event) =>
                  event.stopPropagation()
                }
              />

              <div className="image-modal-help">
                ESC 또는 바깥쪽 클릭으로 닫기
              </div>

            </div>
          )}

        </main>

      </div>

    </div>
  );
}

export default App;
