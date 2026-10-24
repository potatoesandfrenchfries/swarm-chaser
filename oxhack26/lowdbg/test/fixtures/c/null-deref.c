#include <stdio.h>
#include <stdlib.h>

static int *find(int *a, int n, int want) {
    for (int i = 0; i < n; i++)
        if (a[i] == want) return &a[i];
    return NULL;
}

int main(void) {
    int a[3] = {1, 2, 3};
    int *hit = find(a, 3, 9);
    printf("%d\n", *hit); // BUG
    return 0;
}
